import { classesFor } from "@/lib/sim/classes";
import type { Engine } from "@/lib/sim/engine";
import type { Kpi, ModuleId } from "@/lib/sim/types";
import { clipTime, loadedTracks } from "./tracks";
import { realFeedFor } from "./catalog";

/**
 * KPIs for a module running on real footage.
 *
 * Everything here is counted from the boxes the detector actually produced on
 * the clip, so nothing on a real feed claims more than the annotation supports.
 * The operational figures a camera cannot see — a remito line, a dock
 * assignment — stay in the module's own panel, labelled as the operating record.
 */

function classLabel(module: ModuleId, key: string): string {
  return classesFor(module).find((c) => c.key === key)?.label ?? key;
}

/** Distinct track ids seen so far in the clip, per class. */
function trackTotals(module: ModuleId, upTo: number): Map<string, Set<number>> {
  const file = loadedTracks(module);
  const out = new Map<string, Set<number>>();
  if (!file) return out;
  for (const frame of file.frames) {
    if (frame.t > upTo) break;
    for (const [id, cls] of frame.d) {
      let set = out.get(cls);
      if (!set) {
        set = new Set<number>();
        out.set(cls, set);
      }
      set.add(id);
    }
  }
  return out;
}

export function realKpis(engine: Engine, module: ModuleId): Kpi[] {
  const feed = realFeedFor(module);
  const file = loadedTracks(module);
  const frame = engine.frames[module].curr;
  if (!feed || !file) {
    return [{ id: "loading", label: "Detecciones", value: 0, decimals: 0, hint: "cargando anotaciones" }];
  }
  const t = clipTime(module, engine.t);
  const now = new Map<string, number>();
  for (const d of frame?.detections ?? []) now.set(d.cls, (now.get(d.cls) ?? 0) + 1);
  const totals = trackTotals(module, t);

  const kpis: Kpi[] = [];
  for (const { cls } of file.vocab) {
    kpis.push({
      id: `now-${cls}`,
      label: `${classLabel(module, cls)} en cuadro`,
      value: now.get(cls) ?? 0,
      decimals: 0,
      hint: "detecciones del frame actual",
    });
  }
  const distinct = [...totals.values()].reduce((a, s) => a + s.size, 0);
  kpis.push({
    id: "tracks",
    label: "Tracks únicos",
    value: distinct,
    decimals: 0,
    hint: `desde el inicio del clip · ${t.toFixed(1)} s`,
  });
  const conf = frame?.detections ?? [];
  kpis.push({
    id: "conf",
    label: "Confianza media",
    value: conf.length ? (conf.reduce((a, d) => a + d.conf, 0) / conf.length) * 100 : 0,
    unit: "%",
    decimals: 1,
    hint: "score del detector en este frame",
  });
  return kpis;
}
