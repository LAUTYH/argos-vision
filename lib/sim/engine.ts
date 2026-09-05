import { activeProvider, PrecomputedProvider, realVocabulary, type InferenceProvider } from "@/lib/inference";
import { hasRealFeed, realFeedFor } from "@/lib/feeds/catalog";
import { loadTracks } from "@/lib/feeds/tracks";
import { baseClasses, resolvePrompt, type ClassSpec } from "./classes";
import { createWorld, MODULE_IDS, type ModuleData } from "./modules";
import { telemetryFor } from "./telemetry";
import type { DetectionFrame, Kpi, ModuleId, Observable, SimEvent, Telemetry, Zone } from "./types";
import { CLIP_LENGTH, World } from "./world";

export const DEFAULT_SEED = 20260904;
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export type LayerKey = "boxes" | "masks" | "pose" | "tracks" | "zones" | "ids" | "heat";
export const LAYER_KEYS: LayerKey[] = ["boxes", "masks", "pose", "tracks", "zones", "ids"];

export interface FeedSettings {
  layers: Record<LayerKey, boolean>;
  raw: boolean;
}

export interface ActiveClass {
  spec: ClassSpec;
  /** Sim time the class was added; base classes use 0. */
  addedAt: number;
  /** First results arrive shortly after adding a class. */
  readyAt: number;
  visible: boolean;
  /** Prompt text as typed by the user, for display. */
  prompt: string;
}

export interface ModuleFrames {
  prev: DetectionFrame | null;
  curr: DetectionFrame | null;
}

export interface PromptResult {
  ok: boolean;
  /** Set when the prompt matched a class already active. */
  duplicate?: boolean;
  spec?: ClassSpec;
}

const GROUNDING_WARMUP = 0.42;
const MAX_FRAME_DT = 0.1;
const SLOW_INTERVAL = 0.25;

function defaultFeed(): FeedSettings {
  return { layers: { boxes: true, masks: true, pose: true, tracks: true, zones: true, ids: true, heat: true }, raw: false };
}

type Listener = () => void;

/**
 * Owns the clock, the six worlds, the inference provider and the per-module
 * detection frames. React reads it through the hooks in lib/store; the feed
 * canvases read it directly inside their own render loop.
 */
export class Engine {
  readonly provider: InferenceProvider;
  readonly worlds: Record<ModuleId, World<ModuleData>>;
  t = 0;
  playing = true;
  speed: Speed = 1;
  seed: number;
  frames: Record<ModuleId, ModuleFrames>;
  telemetry: Record<ModuleId, Telemetry>;
  feeds: Record<ModuleId, FeedSettings>;
  classes: Record<ModuleId, ActiveClass[]>;
  lastPromptMiss: Record<ModuleId, string | null>;
  /** Bumps every advance(); subscribe for per-frame UI such as the clock. */
  frameVersion = 0;
  /** Bumps ~4× per second; subscribe for KPIs and tables. */
  slowVersion = 0;
  /** Bumps on any settings change (layers, classes, playback). */
  uiVersion = 0;
  private slowAcc = 0;
  private frameListeners = new Set<Listener>();
  private slowListeners = new Set<Listener>();
  private uiListeners = new Set<Listener>();

  /** Serves the modules whose feed is a real clip with offline annotations. */
  readonly precomputed = new PrecomputedProvider();

  constructor(seed = DEFAULT_SEED, provider: InferenceProvider = activeProvider) {
    this.seed = seed;
    this.provider = provider;
    this.worlds = Object.fromEntries(MODULE_IDS.map((m) => [m, createWorld(m, seed)])) as Record<ModuleId, World<ModuleData>>;
    this.frames = Object.fromEntries(MODULE_IDS.map((m) => [m, { prev: null, curr: null }])) as Record<ModuleId, ModuleFrames>;
    this.telemetry = Object.fromEntries(MODULE_IDS.map((m) => [m, emptyTelemetry()])) as Record<ModuleId, Telemetry>;
    this.feeds = Object.fromEntries(MODULE_IDS.map((m) => [m, defaultFeed()])) as Record<ModuleId, FeedSettings>;
    this.classes = Object.fromEntries(
      MODULE_IDS.map((m) => [m, baseClasses(m).map((spec) => ({ spec, addedAt: 0, readyAt: 0, visible: true, prompt: spec.label }))]),
    ) as Record<ModuleId, ActiveClass[]>;
    this.lastPromptMiss = Object.fromEntries(MODULE_IDS.map((m) => [m, null])) as Record<ModuleId, string | null>;
    for (const m of MODULE_IDS) {
      this.worlds[m].onTick((tick, t, latencyMs, observables) => this.handleTick(m, tick, t, latencyMs, observables));
    }
    // Modules backed by real footage swap their class list for the vocabulary
    // the clip was actually annotated with, so nothing on screen promises a
    // class the track file cannot answer.
    if (typeof window !== "undefined") {
      for (const m of MODULE_IDS) {
        if (!hasRealFeed(m)) continue;
        void loadTracks(m).then((file) => {
          if (!file) return;
          const vocab = realVocabulary(m);
          if (vocab.length > 0) {
            this.classes[m] = vocab.map((spec) => ({ spec, addedAt: 0, readyAt: 0, visible: true, prompt: spec.label }));
          }
          this.notifyUi();
        });
      }
    }
  }

  /** The provider answering for a module: precomputed on real clips, simulated otherwise. */
  providerFor(m: ModuleId): InferenceProvider {
    return hasRealFeed(m) ? this.precomputed : this.provider;
  }

  /** True once a module's real clip and its track file are both available. */
  isReal(m: ModuleId): boolean {
    return realFeedFor(m) !== undefined;
  }

  // ── subscriptions ────────────────────────────────────────────────────────
  subscribeFrame = (fn: Listener): (() => void) => {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  };

  subscribeSlow = (fn: Listener): (() => void) => {
    this.slowListeners.add(fn);
    return () => this.slowListeners.delete(fn);
  };

  subscribeUi = (fn: Listener): (() => void) => {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  };

  private notifyUi(): void {
    this.uiVersion += 1;
    for (const fn of this.uiListeners) fn();
  }

  // ── clock ────────────────────────────────────────────────────────────────
  /** Called once per animation frame with the real elapsed seconds. */
  advance(realDt: number): void {
    if (this.playing) {
      const dt = Math.min(realDt, MAX_FRAME_DT) * this.speed;
      let next = this.t + dt;
      if (next >= CLIP_LENGTH) {
        next -= CLIP_LENGTH;
        this.seekAll(next);
      } else {
        this.t = next;
        for (const m of MODULE_IDS) this.worlds[m].stepTo(this.t);
      }
    }
    this.frameVersion += 1;
    for (const fn of this.frameListeners) fn();
    this.slowAcc += realDt;
    if (this.slowAcc >= SLOW_INTERVAL) {
      this.slowAcc = 0;
      this.slowVersion += 1;
      for (const fn of this.slowListeners) fn();
    }
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.notifyUi();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.notifyUi();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(s: Speed): void {
    this.speed = s;
    this.notifyUi();
  }

  seek(t: number): void {
    this.seekAll(Math.max(0, Math.min(CLIP_LENGTH - 0.001, t)));
    this.frameVersion += 1;
    for (const fn of this.frameListeners) fn();
    this.slowVersion += 1;
    for (const fn of this.slowListeners) fn();
    this.notifyUi();
  }

  private seekAll(t: number): void {
    this.t = t;
    for (const m of MODULE_IDS) {
      this.frames[m] = { prev: null, curr: null };
      this.worlds[m].seek(t);
    }
  }

  restart(): void {
    for (const m of MODULE_IDS) {
      this.worlds[m].reset(this.seed);
      this.frames[m] = { prev: null, curr: null };
      this.telemetry[m] = emptyTelemetry();
    }
    this.t = 0;
    this.playing = true;
    this.frameVersion += 1;
    for (const fn of this.frameListeners) fn();
    this.notifyUi();
  }

  // ── inference ────────────────────────────────────────────────────────────
  private handleTick(m: ModuleId, tick: number, t: number, latencyMs: number, observables: Observable[]): void {
    const active = this.classes[m];
    const pending = new Set<string>();
    for (const c of active) if (t < c.readyAt) pending.add(c.spec.key);
    const classes = active.filter((c) => c.visible).map((c) => c.spec);
    const result = this.providerFor(m).ground({
      module: m,
      seed: this.seed,
      tick,
      t,
      latencyMs,
      classes,
      pending,
      observables,
    });
    if (result instanceof Promise) {
      result.then((frame) => this.applyFrame(m, frame)).catch(() => undefined);
    } else {
      this.applyFrame(m, result);
    }
  }

  private applyFrame(m: ModuleId, frame: DetectionFrame): void {
    const f = this.frames[m];
    if (f.curr && frame.tick <= f.curr.tick) return;
    f.prev = f.curr;
    f.curr = frame;
    const raw = telemetryFor(this.seed, m, frame.tick, frame.detections.length, frame.latencyMs);
    const prev = this.telemetry[m];
    const k = prev.fps === 0 ? 1 : 0.25;
    this.telemetry[m] = {
      latencyMs: prev.latencyMs + (raw.latencyMs - prev.latencyMs) * k,
      fps: prev.fps + (raw.fps - prev.fps) * k,
      boxesPerSec: prev.boxesPerSec + (raw.boxesPerSec - prev.boxesPerSec) * k,
      gpuUtil: prev.gpuUtil + (raw.gpuUtil - prev.gpuUtil) * k,
      vramGb: prev.vramGb + (raw.vramGb - prev.vramGb) * k,
      streamFps: prev.streamFps + (raw.streamFps - prev.streamFps) * k,
      boxes: raw.boxes,
    };
  }

  // ── prompts / classes ────────────────────────────────────────────────────
  addPrompt(m: ModuleId, text: string): PromptResult {
    const spec = resolvePrompt(m, text);
    if (!spec) {
      this.lastPromptMiss[m] = text.trim();
      this.notifyUi();
      return { ok: false };
    }
    const existing = this.classes[m].find((c) => c.spec.key === spec.key);
    if (existing) {
      existing.visible = true;
      this.lastPromptMiss[m] = null;
      this.notifyUi();
      return { ok: true, duplicate: true, spec };
    }
    this.classes[m] = [...this.classes[m], { spec, addedAt: this.t, readyAt: this.t + GROUNDING_WARMUP, visible: true, prompt: text.trim() }];
    this.lastPromptMiss[m] = null;
    this.notifyUi();
    return { ok: true, spec };
  }

  removeClass(m: ModuleId, key: string): void {
    this.classes[m] = this.classes[m].filter((c) => c.spec.key !== key);
    this.notifyUi();
  }

  toggleClass(m: ModuleId, key: string): void {
    const c = this.classes[m].find((x) => x.spec.key === key);
    if (!c) return;
    c.visible = !c.visible;
    this.notifyUi();
  }

  clearPromptMiss(m: ModuleId): void {
    if (this.lastPromptMiss[m] === null) return;
    this.lastPromptMiss[m] = null;
    this.notifyUi();
  }

  isPending(m: ModuleId, key: string): boolean {
    const c = this.classes[m].find((x) => x.spec.key === key);
    return c ? this.t < c.readyAt : false;
  }

  /** Count of detections per class in the latest frame. */
  classCounts(m: ModuleId): Record<string, number> {
    const out: Record<string, number> = {};
    const f = this.frames[m].curr;
    if (!f) return out;
    for (const d of f.detections) out[d.cls] = (out[d.cls] ?? 0) + 1;
    return out;
  }

  // ── feed settings ────────────────────────────────────────────────────────
  setLayer(m: ModuleId, layer: LayerKey, on: boolean): void {
    this.feeds[m].layers[layer] = on;
    this.notifyUi();
  }

  setRaw(m: ModuleId, raw: boolean): void {
    this.feeds[m].raw = raw;
    this.notifyUi();
  }

  // ── reads ────────────────────────────────────────────────────────────────
  kpis(m: ModuleId): Kpi[] {
    return this.worlds[m].kpis();
  }

  zones(m: ModuleId): Zone[] {
    return this.worlds[m].zones();
  }

  events(m?: ModuleId, limit = 60): SimEvent[] {
    const list: SimEvent[] = [];
    for (const id of MODULE_IDS) {
      if (m && id !== m) continue;
      for (const ev of this.worlds[id].state.events) list.push(ev);
    }
    list.sort((a, b) => b.t - a.t || b.id - a.id);
    return list.slice(0, limit);
  }

  activeAlerts(): number {
    let n = 0;
    const from = this.t - 120;
    for (const id of MODULE_IDS) {
      for (const ev of this.worlds[id].state.events) if (ev.t >= from && (ev.severity === "high" || ev.severity === "medium")) n++;
    }
    return n;
  }
}

function emptyTelemetry(): Telemetry {
  return { latencyMs: 0, fps: 0, boxesPerSec: 0, gpuUtil: 0, vramGb: 0, streamFps: 0, boxes: 0 };
}

let singleton: Engine | null = null;

export function getEngine(): Engine {
  if (!singleton) singleton = new Engine();
  return singleton;
}
