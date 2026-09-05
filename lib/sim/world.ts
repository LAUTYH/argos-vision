import { hashRng, Rng } from "./rng";
import { latencyFor } from "./telemetry";
import { scriptedActions } from "./timeline";
import type {
  Entity,
  Kpi,
  ModuleId,
  Observable,
  Severity,
  SimEvent,
  SiteId,
  Zone,
} from "./types";

/** Fixed physics step. Rendering rate never affects the simulation. */
export const DT = 1 / 60;
export const STEPS_PER_SECOND = 60;
/** Seconds between state snapshots used for fast, deterministic scrubbing. */
export const SNAP_INTERVAL = 15;
/** Length of the clip every feed loops over. */
export const CLIP_LENGTH = 600;

const MAX_EVENTS = 400;
const ID_FLICKER_P = 0.01;

export interface WorldState<D> {
  seed: number;
  t: number;
  step: number;
  rng: number;
  nextId: number;
  nextTrack: number;
  nextEventId: number;
  entities: Entity[];
  events: SimEvent[];
  tick: number;
  tickT: number;
  nextTickAt: number;
  lastLatency: number;
  lastBoxes: number;
  data: D;
}

export interface EmitArgs {
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  entityId?: number;
}

export interface StepCtx {
  rng: Rng;
  dt: number;
  t: number;
  /** Scripted actions that fire during this step (see timeline.ts). */
  actions: string[];
  emit: (e: EmitArgs) => void;
  id: () => number;
  track: () => number;
}

export interface InitCtx {
  rng: Rng;
  seed: number;
  id: () => number;
  track: () => number;
}

export interface ModuleDef<D> {
  id: ModuleId;
  site: SiteId;
  init: (ctx: InitCtx) => { data: D; entities: Entity[] };
  step: (state: WorldState<D>, ctx: StepCtx) => void;
  observe: (state: WorldState<D>) => Observable[];
  zones: (state: WorldState<D>) => Zone[];
  kpis: (state: WorldState<D>) => Kpi[];
}

export type TickListener = (tick: number, t: number, latencyMs: number, observables: Observable[]) => void;

const MOVERS = new Set<Entity["kind"]>(["caja", "persona", "montacarga", "camion"]);

/**
 * A deterministic world for one module. Steps at a fixed 60 Hz, keeps
 * snapshots every SNAP_INTERVAL seconds so `seek` is cheap, and fires an
 * inference tick whenever the simulated model would have returned a result.
 */
export class World<D> {
  readonly def: ModuleDef<D>;
  state: WorldState<D>;
  private snaps: Array<WorldState<D> | undefined> = [];
  private obsCache: { step: number; obs: Observable[] } | null = null;
  private listeners = new Set<TickListener>();

  constructor(def: ModuleDef<D>, seed: number) {
    this.def = def;
    this.state = this.fresh(seed);
    this.snaps[0] = structuredClone(this.state);
  }

  get seed(): number {
    return this.state.seed;
  }

  get t(): number {
    return this.state.t;
  }

  onTick(fn: TickListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  reset(seed = this.state.seed): void {
    this.state = this.fresh(seed);
    this.snaps = [structuredClone(this.state)];
    this.obsCache = null;
  }

  private fresh(seed: number): WorldState<D> {
    const rng = new Rng(seed ^ 0x9e3779b9);
    let nextId = 1;
    let nextTrack = hashRng(seed, this.def.id, "track0").int(100, 900);
    const ctx: InitCtx = {
      rng,
      seed,
      id: () => nextId++,
      track: () => nextTrack++,
    };
    const { data, entities } = this.def.init(ctx);
    return {
      seed,
      t: 0,
      step: 0,
      rng: rng.state,
      nextId,
      nextTrack,
      nextEventId: 1,
      entities,
      events: [],
      tick: 0,
      tickT: 0,
      nextTickAt: 0.12,
      lastLatency: 0,
      lastBoxes: 0,
      data,
    };
  }

  /** Advances the world so `state.t` is the last fixed step at or before `t`. */
  stepTo(t: number): void {
    const target = Math.floor(t * STEPS_PER_SECOND + 1e-6);
    while (this.state.step < target) this.doStep();
  }

  /** Jumps to any time in the clip, restoring the nearest snapshot first. */
  seek(t: number): void {
    const target = Math.max(0, Math.min(CLIP_LENGTH, t));
    const targetStep = Math.floor(target * STEPS_PER_SECOND + 1e-6);
    if (targetStep >= this.state.step && targetStep - this.state.step < SNAP_INTERVAL * STEPS_PER_SECOND * 2) {
      this.stepTo(target);
      return;
    }
    let idx = Math.floor(target / SNAP_INTERVAL);
    while (idx > 0 && this.snaps[idx] === undefined) idx--;
    const snap = this.snaps[idx] ?? this.snaps[0];
    if (!snap) throw new Error("world has no base snapshot");
    this.state = structuredClone(snap);
    this.obsCache = null;
    this.stepTo(target);
  }

  observe(): Observable[] {
    if (this.obsCache && this.obsCache.step === this.state.step) return this.obsCache.obs;
    const obs = this.def.observe(this.state);
    this.obsCache = { step: this.state.step, obs };
    return obs;
  }

  zones(): Zone[] {
    return this.def.zones(this.state);
  }

  kpis(): Kpi[] {
    return this.def.kpis(this.state);
  }

  private doStep(): void {
    const s = this.state;
    const rng = new Rng(s.rng);
    const t0 = s.step * DT;
    const t1 = (s.step + 1) * DT;
    const actions = scriptedActions(this.def.id, t0, t1);
    const ctx: StepCtx = {
      rng,
      dt: DT,
      t: t1,
      actions,
      emit: (e) => this.emit(e, t1),
      id: () => s.nextId++,
      track: () => s.nextTrack++,
    };
    this.def.step(s, ctx);
    s.step += 1;
    s.t = t1;
    s.rng = rng.state;
    this.obsCache = null;

    if (s.t + 1e-9 >= s.nextTickAt) {
      s.tick += 1;
      s.tickT = s.t;
      const obs = this.observe();
      const latency = latencyFor(s.seed, this.def.id, s.tick, obs.length);
      s.lastLatency = latency;
      s.lastBoxes = obs.length;
      s.nextTickAt = s.t + latency / 1000;
      this.flickerIds(s.tick);
      for (const fn of this.listeners) fn(s.tick, s.t, latency, obs);
    }

    if (s.step % (SNAP_INTERVAL * STEPS_PER_SECOND) === 0) {
      const idx = s.step / (SNAP_INTERVAL * STEPS_PER_SECOND);
      if (this.snaps[idx] === undefined) this.snaps[idx] = structuredClone(s);
    }
  }

  /** Rare tracker id switches: about one every hundred inference ticks. */
  private flickerIds(tick: number): void {
    const s = this.state;
    const r = hashRng(s.seed, "flicker", this.def.id, tick);
    if (!r.chance(ID_FLICKER_P)) return;
    const movers = s.entities.filter((e) => MOVERS.has(e.kind));
    if (movers.length === 0) return;
    const victim = r.pick(movers);
    victim.trackId = s.nextTrack++;
  }

  private emit(e: EmitArgs, t: number): void {
    const s = this.state;
    const ev: SimEvent = {
      id: s.nextEventId++,
      t,
      module: this.def.id,
      site: this.def.site,
      severity: e.severity,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      entityId: e.entityId,
    };
    s.events.push(ev);
    if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  }
}
