/**
 * Measures the detector's imperfections. A detector that never misses reads
 * as fake, so these numbers are a target, not a defect. Run with
 * `pnpm realism:check`.
 */
import { baseClasses } from "../lib/sim/classes";
import { CONF_MAX, CONF_MIN, detectFrame } from "../lib/sim/detector";
import { createWorld, MODULE_IDS } from "../lib/sim/modules";
import type { ModuleId } from "../lib/sim/types";


const SEED = 20260904;
const SECONDS = 240;

interface Stats {
  frames: number;
  expected: number;
  emitted: number;
  spurious: number;
  conf: number[];
  jitter: number[];
  latency: number[];
  drops: number;
  reappear: number;
  idSwitch: number;
}

const rows: Array<[ModuleId, Stats]> = [];

for (const m of MODULE_IDS) {
  const world = createWorld(m, SEED);
  const classes = baseClasses(m);
  const st: Stats = { frames: 0, expected: 0, emitted: 0, spurious: 0, conf: [], jitter: [], latency: [], drops: 0, reappear: 0, idSwitch: 0 };
  const prevBox = new Map<string, { x: number; y: number }>();
  const seenLast = new Set<string>();
  const missing = new Set<string>();
  const trackOf = new Map<number, number>();

  world.onTick((tick, t, latency, obs) => {
    const frame = detectFrame({ seed: SEED, module: m, tick, t, latencyMs: latency, observables: obs, classes });
    st.frames++;
    st.latency.push(latency);
    let expected = 0;
    for (const o of obs) for (const c of classes) if (c.match(o)) expected++;
    st.expected += expected;
    st.emitted += frame.detections.length;

    const truth = new Map<string, { x: number; y: number }>();
    for (const o of obs) for (const c of classes) if (c.match(o)) truth.set(`${o.entityId}:${c.key}`, { x: (c.boxOf ? c.boxOf(o) : o.box)?.x ?? 0, y: (c.boxOf ? c.boxOf(o) : o.box)?.y ?? 0 });

    const now = new Set<string>();
    for (const d of frame.detections) {
      if (d.entityId < 0) {
        st.spurious++;
        continue;
      }
      const key = `${d.entityId}:${d.cls}`;
      now.add(key);
      st.conf.push(d.conf);
      // Jitter is the gap between the reported box and the true one, not the
      // frame-to-frame movement of the object itself.
      const gt = truth.get(key);
      if (gt) st.jitter.push(Math.hypot(d.box.x - gt.x, d.box.y - gt.y));
      prevBox.set(key, { x: d.box.x, y: d.box.y });
      if (missing.has(key)) {
        st.reappear++;
        missing.delete(key);
      }
      const known = trackOf.get(d.entityId);
      if (known !== undefined && known !== d.trackId) st.idSwitch++;
      trackOf.set(d.entityId, d.trackId);
    }
    for (const key of seenLast) {
      if (!now.has(key)) {
        st.drops++;
        missing.add(key);
      }
    }
    seenLast.clear();
    for (const k of now) seenLast.add(k);
  });

  world.stepTo(SECONDS);
  rows.push([m, st]);
}

const pct = (n: number, d: number): string => `${((n / Math.max(1, d)) * 100).toFixed(2)}%`;
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

console.warn(`Ruido del detector · ${SECONDS} s por módulo · semilla ${SEED}\n`);
console.warn("módulo       frames  cajas  no-detect  reaparece  conf med [min–max]   jitter px  flicker ID  falsos+  latencia ms");
for (const [m, s] of rows) {
  const min = Math.min(...s.conf);
  const max = Math.max(...s.conf);
  console.warn(
    `${m.padEnd(12)} ${String(s.frames).padStart(5)} ${String(s.emitted).padStart(6)}  ${pct(s.expected - s.emitted + s.spurious, s.expected).padStart(8)}  ${String(s.reappear).padStart(8)}  ` +
      `${mean(s.conf).toFixed(3)} [${min.toFixed(2)}–${max.toFixed(2)}]  ${mean(s.jitter).toFixed(2).padStart(8)}  ${String(s.idSwitch).padStart(9)}  ${String(s.spurious).padStart(6)}  ` +
      `${mean(s.latency).toFixed(0).padStart(6)} ±${Math.round(Math.sqrt(mean(s.latency.map((x) => (x - mean(s.latency)) ** 2))))}`,
  );
}
const allConf = rows.flatMap(([, s]) => s.conf);
console.warn(`\nrango declarado ${CONF_MIN}–${CONF_MAX} · observado ${Math.min(...allConf).toFixed(3)}–${Math.max(...allConf).toFixed(3)}`);
