import { hashRng, valueNoise1 } from "./rng";
import type { ModuleId, Telemetry } from "./types";

/**
 * Per-module inference telemetry. All values are simulated: the numbers model
 * a production runtime where latency grows with the number of boxes decoded
 * per frame, with gaussian noise and the occasional spike, so nothing sits on
 * a fixed value.
 */

interface Profile {
  baseMs: number;
  perBoxMs: number;
  sd: number;
  spikeP: number;
  spikeMs: number;
  streamFps: number;
  gpuBase: number;
}

const PROFILES: Record<ModuleId, Profile> = {
  recepcion: { baseMs: 71, perBoxMs: 2.1, sd: 5.5, spikeP: 0.035, spikeMs: 38, streamFps: 30, gpuBase: 61 },
  seguridad: { baseMs: 78, perBoxMs: 2.6, sd: 6, spikeP: 0.03, spikeMs: 42, streamFps: 25, gpuBase: 64 },
  flujo: { baseMs: 69, perBoxMs: 2.0, sd: 5, spikeP: 0.03, spikeMs: 34, streamFps: 30, gpuBase: 58 },
  patio: { baseMs: 83, perBoxMs: 2.4, sd: 6.5, spikeP: 0.04, spikeMs: 45, streamFps: 25, gpuBase: 66 },
  inspeccion: { baseMs: 142, perBoxMs: 6.5, sd: 11, spikeP: 0.05, spikeMs: 70, streamFps: 30, gpuBase: 72 },
  documentos: { baseMs: 214, perBoxMs: 3.2, sd: 14, spikeP: 0.04, spikeMs: 90, streamFps: 5, gpuBase: 47 },
};

export function latencyFor(seed: number, module: ModuleId, tick: number, boxes: number): number {
  const p = PROFILES[module];
  const r = hashRng(seed, "latency", module, tick);
  let ms = p.baseMs + p.perBoxMs * boxes + r.gaussian(0, p.sd);
  if (r.chance(p.spikeP)) ms += p.spikeMs * r.float(0.6, 1.4);
  // slow drift (thermal / contention) over ~40 s
  ms += valueNoise1(seed ^ 0x51ab, tick / 400) * p.sd * 1.5;
  return Math.max(p.baseMs * 0.6, ms);
}

export function telemetryFor(
  seed: number,
  module: ModuleId,
  tick: number,
  boxes: number,
  latencyMs: number,
): Telemetry {
  const p = PROFILES[module];
  const r = hashRng(seed, "telemetry", module, tick);
  const fps = 1000 / latencyMs;
  const gpuDrift = valueNoise1(seed ^ 0x77, tick / 90) * 9;
  const gpuUtil = Math.min(99, Math.max(12, p.gpuBase + gpuDrift + boxes * 0.6 + r.gaussian(0, 2.2)));
  const vram = 9.4 + boxes * 0.012 + valueNoise1(seed ^ 0x99, tick / 300) * 0.25;
  const streamFps = p.streamFps + r.gaussian(0, p.streamFps > 10 ? 0.12 : 0.02);
  return {
    latencyMs,
    fps,
    boxesPerSec: boxes * fps,
    gpuUtil,
    vramGb: vram,
    streamFps,
    boxes,
  };
}

export function streamFpsFor(module: ModuleId): number {
  return PROFILES[module].streamFps;
}
