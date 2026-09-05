import { classColor, type ClassSpec } from "./classes";
import { clamp } from "./camera";
import { hashRng, strHash, valueNoise1 } from "./rng";
import type { Box, Detection, DetectionFrame, ModuleId, Observable, Vec2 } from "./types";

/**
 * Turns what the camera can see into what a detector would report.
 *
 * A perfect detector reads as fake, so this one is deliberately imperfect:
 * sub-pixel jitter on every edge, confidence that drifts over time instead of
 * sitting still, ~2 % of boxes dropping for a single tick, a rare spurious
 * box, and lower confidence for far or partially hidden objects. Every effect
 * is a pure function of (seed, tick, entity, class) so scrubbing reproduces
 * the same noise.
 */

export const CONF_MIN = 0.72;
export const CONF_MAX = 0.98;
const FN_BASE = 0.02;
const FP_TICK_P = 0.015;

export interface DetectOptions {
  seed: number;
  module: ModuleId;
  tick: number;
  t: number;
  latencyMs: number;
  observables: Observable[];
  classes: ClassSpec[];
  /** Classes whose grounding is still "warming up" are skipped. */
  pending?: Set<string>;
}

export function detectFrame(o: DetectOptions): DetectionFrame {
  const detections: Detection[] = [];
  for (const obs of o.observables) {
    for (const cls of o.classes) {
      if (o.pending?.has(cls.key)) continue;
      if (!cls.match(obs)) continue;
      const det = detectOne(o, obs, cls);
      if (det) detections.push(det);
    }
  }
  // Spurious double detection: the model occasionally emits a second, low
  // confidence box next to a real one. It never survives the next tick.
  const fp = hashRng(o.seed, "fp", o.module, o.tick);
  if (detections.length > 0 && fp.chance(FP_TICK_P)) {
    const src = fp.pick(detections);
    const dx = src.box.w * fp.float(0.18, 0.32) * (fp.chance(0.5) ? 1 : -1);
    const dy = src.box.h * fp.float(-0.12, 0.12);
    detections.push({
      ...src,
      trackId: 9000 + (o.tick % 900),
      entityId: -1,
      conf: fp.float(CONF_MIN, CONF_MIN + 0.03),
      box: { x: src.box.x + dx, y: src.box.y + dy, w: src.box.w * fp.float(0.86, 1.08), h: src.box.h * fp.float(0.9, 1.05) },
      mask: undefined,
      pose: undefined,
      trail: undefined,
      status: "ok",
    });
  }
  return { tick: o.tick, t: o.t, latencyMs: o.latencyMs, detections };
}

function detectOne(o: DetectOptions, obs: Observable, cls: ClassSpec): Detection | null {
  const key = strHash(cls.key);
  const r = hashRng(o.seed, "det", o.module, o.tick, obs.entityId, key);
  const box = cls.boxOf ? cls.boxOf(obs) : obs.box;
  if (!box || box.w < 3 || box.h < 3) return null;

  const stable = hashRng(o.seed, "stable", obs.entityId, key).next();
  let base = 0.86 + (stable - 0.5) * 0.14;
  base -= obs.depth * 0.08;
  base -= obs.occlusion * 0.3;
  if (!cls.base) base -= 0.03;
  const drift = valueNoise1(hashSeed(o.seed, obs.entityId, key), o.t * 0.9) * 0.035;
  const conf = clamp(base + drift + r.gaussian(0, 0.009), CONF_MIN, CONF_MAX);

  // Miss rate. Heavy occlusion and distance make a miss more likely, but the
  // total stays low: a box that blinks every tenth frame reads as broken, not
  // as a real detector.
  let fn = FN_BASE + obs.occlusion * 0.1;
  if (obs.depth > 0.85) fn += 0.015;
  if (conf < 0.75) fn += 0.03;
  if (r.chance(Math.min(0.07, fn))) return null;

  const size = Math.max(box.w, box.h);
  const sd = 0.45 + size * 0.006;
  const breathe = 1 + r.gaussian(0, 0.004);
  const jittered: Box = {
    x: box.x + r.gaussian(0, sd),
    y: box.y + r.gaussian(0, sd),
    w: Math.max(2, box.w * breathe + r.gaussian(0, sd)),
    h: Math.max(2, box.h * breathe + r.gaussian(0, sd)),
  };

  const mask = cls.shape === "mask" && obs.mask ? jitterPoly(obs.mask, r, 0.8) : undefined;
  const pose = cls.shape === "pose" && obs.pose ? jitterPoly(obs.pose, r, 1.0) : undefined;
  const status = cls.status ? cls.status(obs) : "ok";
  const sub = cls.sub ? cls.sub(obs) : undefined;

  return {
    trackId: obs.trackId,
    entityId: obs.entityId,
    cls: cls.key,
    label: cls.label,
    conf,
    box: jittered,
    mask,
    pose,
    trail: obs.trail,
    status,
    sub,
    color: classColor(cls),
  };
}

function hashSeed(seed: number, a: number, b: number): number {
  return (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0;
}

function jitterPoly(points: Vec2[], r: { gaussian: (m: number, s: number) => number }, sd: number): Vec2[] {
  return points.map((p) => ({ x: p.x + r.gaussian(0, sd), y: p.y + r.gaussian(0, sd) }));
}
