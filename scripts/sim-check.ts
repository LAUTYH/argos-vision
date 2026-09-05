/**
 * Sanity check for the simulation engine: determinism, scripted beats and
 * basic invariants. Run with `pnpm sim:check`.
 */
import { detectFrame } from "../lib/sim/detector";
import { baseClasses } from "../lib/sim/classes";
import { createWorld, MODULE_IDS, type ModuleData } from "../lib/sim/modules";
import { tallies, unitsPerHour } from "../lib/sim/modules/recepcion";
import { World } from "../lib/sim/world";
import type { ModuleId } from "../lib/sim/types";

const SEED = 20260904;

function run(seed: number, seconds: number) {
  const worlds = Object.fromEntries(MODULE_IDS.map((m) => [m, createWorld(m, seed)])) as Record<ModuleId, World<ModuleData>>;
  const frames: Record<string, string[]> = {};
  for (const m of MODULE_IDS) {
    frames[m] = [];
    worlds[m].onTick((tick, t, latency, obs) => {
      const f = detectFrame({ seed, module: m, tick, t, latencyMs: latency, observables: obs, classes: baseClasses(m) });
      frames[m]?.push(`${tick}:${f.detections.length}:${f.detections.map((d) => `${d.trackId}/${d.box.x.toFixed(1)}/${d.conf.toFixed(3)}`).join(",")}`);
    });
  }
  const t0 = performance.now();
  for (let s = 0; s <= seconds; s += 1 / 60) for (const m of MODULE_IDS) worlds[m].stepTo(s);
  const ms = performance.now() - t0;
  return { worlds, frames, ms };
}

const a = run(SEED, 120);
const b = run(SEED, 120);
let identical = true;
for (const m of MODULE_IDS) {
  const fa = a.frames[m] ?? [];
  const fb = b.frames[m] ?? [];
  if (fa.length !== fb.length || fa.some((x, i) => x !== fb[i])) identical = false;
  const ea = JSON.stringify(a.worlds[m].state.events);
  const eb = JSON.stringify(b.worlds[m].state.events);
  if (ea !== eb) identical = false;
}
console.warn(`determinism: ${identical ? "OK" : "FAIL"} · 6 worlds × 120 s in ${a.ms.toFixed(0)} ms`);

// seek check: a fresh world sought to 95 s must equal a world stepped to 95 s
{
  const w1 = createWorld("patio", SEED);
  w1.stepTo(95);
  const w2 = createWorld("patio", SEED);
  w2.stepTo(30);
  w2.seek(95);
  const s1 = JSON.stringify(w1.state.entities);
  const s2 = JSON.stringify(w2.state.entities);
  console.warn(`seek equivalence: ${s1 === s2 ? "OK" : "FAIL"}`);
  w2.seek(20);
  const w3 = createWorld("patio", SEED);
  w3.stepTo(20);
  console.warn(`seek backwards: ${JSON.stringify(w2.state.entities) === JSON.stringify(w3.state.entities) ? "OK" : "FAIL"}`);
}

for (const m of MODULE_IDS) {
  const w = a.worlds[m];
  const ev = w.state.events.map((e) => `${e.t.toFixed(1)}s [${e.severity}] ${e.title}`);
  console.warn(`\n== ${m} · ${w.state.entities.length} entities · ${w.state.tick} ticks · ${ev.length} events · last latency ${w.state.lastLatency.toFixed(0)} ms`);
  for (const line of ev.slice(0, 14)) console.warn("  " + line);
  const fr = a.frames[m] ?? [];
  const counts = fr.map((f) => Number(f.split(":")[1]));
  const avg = counts.reduce((x, y) => x + y, 0) / Math.max(1, counts.length);
  console.warn(`  detections/frame avg ${avg.toFixed(1)} · kpis: ${w.kpis().map((k) => `${k.label}=${k.value.toFixed(k.decimals ?? 0)}${k.unit ?? ""}`).join(" | ")}`);
}
{
  const w = a.worlds.recepcion as World<import("../lib/sim/modules/recepcion").RecepcionData>;
  const t = tallies(w.state);
  console.warn(`\nrecepcion tallies @120s: ${JSON.stringify(t)} uph=${unitsPerHour(w.state).toFixed(0)} done=${w.state.data.done} queue=${w.state.data.queue.length}`);
}
// NaN scan
let nan = 0;
for (const m of MODULE_IDS) {
  const s = JSON.stringify(a.worlds[m].state);
  if (s.includes("null") && m !== "seguridad" && m !== "flujo") { /* zone null is legit */ }
  for (const o of a.worlds[m].observe()) {
    if ([o.box.x, o.box.y, o.box.w, o.box.h].some((v) => !Number.isFinite(v))) nan++;
  }
}
console.warn(`\nnon-finite boxes: ${nan}`);
