import { DEFECT_LABEL, WIND_ASSETS } from "@/lib/data/company";
import { clamp } from "../camera";
import { hashRng } from "../rng";
import type { DefectEntity, DefectSeverity, DefectType, Entity, Kpi, Observable, Vec2, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";

/**
 * Drone pass along a turbine blade. The camera slides from root to tip at a
 * constant speed; defects are static features of each (asset, blade) pair
 * generated from the seed, so the history table and the live feed agree.
 */
export const BLADE_LENGTH_M = 67;
export const PX_PER_M = 104;
export const VIEW_HALF = 640 / (BLADE_LENGTH_M * PX_PER_M);
export const PASS_SECONDS = 48;
export const PASS_GAP = 4;
export const BLADE_CY = 372;

export interface Pass {
  assetId: string;
  blade: "A" | "B" | "C";
}

export const PASSES: Pass[] = [];
for (const id of ["WTG-07", "WTG-08", "WTG-05", "WTG-11"]) {
  for (const blade of ["A", "B", "C"] as const) PASSES.push({ assetId: id, blade });
}

/** Half chord in metres along the blade (0 root .. 1 tip). */
export function halfChord(u: number): number {
  const root = 1.55;
  const max = 2.15;
  const tip = 0.32;
  if (u < 0.18) return root + (max - root) * (u / 0.18);
  const k = (u - 0.18) / 0.82;
  return max + (tip - max) * (k * k * (3 - 2 * k)) * 0.72 + (tip - max) * 0.28 * k;
}

export function halfChordPx(u: number): number {
  return halfChord(u) * PX_PER_M;
}

export interface InspeccionData {
  passIdx: number;
  passT: number;
  seen: number[];
  passSeenIds: number[];
  passesDone: number;
  pausedUntil: number;
}

/** Weighted so lightning strikes stay rare and erosion dominates, as on a real fleet. */
const TYPE_WEIGHTS: Array<[DefectType, number]> = [
  ["erosion", 0.34],
  ["pintura", 0.25],
  ["delaminacion", 0.2],
  ["grieta", 0.16],
  ["rayo", 0.05],
];

function pickType(r: { next: () => number }): DefectType {
  let k = r.next();
  for (const [type, w] of TYPE_WEIGHTS) {
    k -= w;
    if (k <= 0) return type;
  }
  return "erosion";
}

function blobPoly(r: { float: (a: number, b: number) => number }, n: number, elong: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = r.float(0.62, 1);
    pts.push({ x: Math.cos(a) * rad * elong, y: Math.sin(a) * rad });
  }
  return pts;
}

/** Deterministic defect list for an asset blade; also used by the history table. */
export function defectsFor(seed: number, assetId: string, blade: string): Array<Omit<DefectEntity, "id" | "trackId" | "born">> {
  const r = hashRng(seed, "defects", assetId, blade);
  const asset = WIND_ASSETS.find((a) => a.id === assetId);
  const wear = asset ? clamp((asset.hours - 20000) / 25000, 0, 1) : 0.5;
  const n = Math.max(1, Math.round(r.float(1.2, 3.4) + wear * 2.2));
  const out: Array<Omit<DefectEntity, "id" | "trackId" | "born">> = [];
  for (let i = 0; i < n; i++) {
    const type = i === 0 && wear > 0.5 ? "erosion" : pickType(r);
    const u = type === "erosion" ? r.float(0.55, 0.96) : r.float(0.08, 0.95);
    const v = type === "erosion" ? -0.86 : r.float(-0.7, 0.7);
    const su = type === "erosion" ? r.float(0.02, 0.05) : type === "grieta" ? r.float(0.004, 0.011) : r.float(0.006, 0.02);
    const sv = type === "erosion" ? 0.16 : type === "grieta" ? r.float(0.35, 0.8) : r.float(0.18, 0.4);
    // Older machines carry larger defects, so the fleet table reads as a
    // service history rather than noise.
    const areaPct = clamp(su * sv * 100 * r.float(0.8, 1.2) * (type === "erosion" ? 0.6 : 1.4) * (0.55 + wear * 0.85), 0.02, 3.5);
    let severity: DefectSeverity = "baja";
    if ((type === "rayo" && areaPct > 0.45) || (type === "grieta" && sv > 0.62) || areaPct > 1.6) severity = "alta";
    else if (areaPct > 0.42 || type === "grieta" || type === "rayo") severity = "media";
    out.push({
      kind: "defecto",
      type,
      assetId,
      blade: blade as "A" | "B" | "C",
      u,
      v,
      su,
      sv,
      severity,
      areaPct,
      poly: type === "grieta" ? crackPoly(r) : blobPoly(r, 10, 1),
    });
  }
  return out.sort((a, b) => a.u - b.u);
}

function crackPoly(r: { float: (a: number, b: number) => number }): Vec2[] {
  const pts: Vec2[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) pts.push({ x: r.float(-1, 1) * 0.5, y: -1 + (2 * i) / (n - 1) });
  const back: Vec2[] = [];
  for (let i = n - 1; i >= 0; i--) back.push({ x: (pts[i]?.x ?? 0) + r.float(0.5, 1), y: pts[i]?.y ?? 0 });
  return [...pts, ...back];
}

function loadPass(ctx: InitCtx | StepCtx, seed: number, passIdx: number): Entity[] {
  const pass = PASSES[passIdx % PASSES.length];
  if (!pass) return [];
  return defectsFor(seed, pass.assetId, pass.blade).map((d) => ({ ...d, id: ctx.id(), trackId: ctx.track(), born: 0 }));
}

function init(ctx: InitCtx): { data: InspeccionData; entities: Entity[] } {
  return {
    data: { passIdx: 0, passT: 0, seen: [], passSeenIds: [], passesDone: 0, pausedUntil: 0 },
    entities: loadPass(ctx, ctx.seed, 0),
  };
}

export function cameraU(passT: number): number {
  return clamp(0.02 + (passT / PASS_SECONDS) * 0.96, 0, 1);
}

export function currentPass(state: WorldState<InspeccionData>): Pass {
  return PASSES[state.data.passIdx % PASSES.length] ?? { assetId: "WTG-07", blade: "A" };
}

function step(state: WorldState<InspeccionData>, ctx: StepCtx): void {
  const d = state.data;
  if (ctx.t < d.pausedUntil) return;
  d.passT += ctx.dt;
  if (d.passT >= PASS_SECONDS + PASS_GAP) {
    const prev = currentPass(state);
    const found = d.passSeenIds.length;
    d.passesDone += 1;
    d.passIdx += 1;
    d.passT = 0;
    d.passSeenIds = [];
    state.entities = loadPass(ctx, state.seed, d.passIdx);
    const next = currentPass(state);
    ctx.emit({
      severity: "info",
      kind: "inspection",
      title: `Pasada completa · ${prev.assetId} pala ${prev.blade}`,
      detail: `${found} defecto${found === 1 ? "" : "s"} · siguiente ${next.assetId} pala ${next.blade}`,
    });
    return;
  }
  const u = cameraU(d.passT);
  for (const e of state.entities) {
    if (e.kind !== "defecto") continue;
    if (d.passSeenIds.includes(e.id)) continue;
    if (Math.abs(e.u - u) < VIEW_HALF * 0.78) {
      d.passSeenIds.push(e.id);
      d.seen.push(e.id);
      const pos = (e.u * BLADE_LENGTH_M).toFixed(1);
      ctx.emit({
        severity: e.severity === "alta" ? "high" : e.severity === "media" ? "medium" : "low",
        kind: "defect",
        title: `${DEFECT_LABEL[e.type] ?? e.type} · ${e.assetId} pala ${e.blade}`,
        detail: `${pos} m desde raíz · ${e.areaPct.toFixed(2)} % de área · severidad ${e.severity}`,
        entityId: e.id,
      });
    }
  }
}

export function defectScreenBox(e: DefectEntity, u: number) {
  const lenPx = BLADE_LENGTH_M * PX_PER_M;
  const cx = 640 + (e.u - u) * lenPx;
  const hc = halfChordPx(e.u);
  const cy = BLADE_CY + e.v * hc;
  const w = e.su * lenPx;
  const h = e.sv * hc * 2 * 0.5;
  return { cx, cy, w, h };
}

function observe(state: WorldState<InspeccionData>): Observable[] {
  const u = cameraU(state.data.passT);
  if (state.t < state.data.pausedUntil) return [];
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind !== "defecto") continue;
    const b = defectScreenBox(e, u);
    if (b.cx + b.w / 2 < 0 || b.cx - b.w / 2 > 1280) continue;
    const mask = e.poly.map((p) => ({ x: b.cx + (p.x * b.w) / 2, y: b.cy + (p.y * b.h) / 2 }));
    items.push({
      entityId: e.id,
      trackId: e.trackId,
      kind: "defecto",
      box: { x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h },
      depth: 0.1,
      occlusion: 0,
      mask,
      attrs: { defectType: e.type, severity: e.severity, areaPct: e.areaPct, assetId: e.assetId },
    });
  }
  return items;
}

function zones(): Zone[] {
  return [];
}

export function passStats(state: WorldState<InspeccionData>) {
  const seen = state.entities.filter((e): e is DefectEntity => e.kind === "defecto" && state.data.passSeenIds.includes(e.id));
  const area = seen.reduce((a, e) => a + e.areaPct, 0);
  let max: DefectSeverity | "—" = "—";
  for (const e of seen) {
    if (e.severity === "alta") max = "alta";
    else if (e.severity === "media" && max !== "alta") max = "media";
    else if (max === "—") max = "baja";
  }
  return { seen, area, max, total: state.entities.filter((e) => e.kind === "defecto").length };
}

function kpis(state: WorldState<InspeccionData>): Kpi[] {
  const s = passStats(state);
  const sevValue = s.max === "alta" ? 3 : s.max === "media" ? 2 : s.max === "baja" ? 1 : 0;
  return [
    { id: "defects", label: "Defectos en pasada", value: s.seen.length, decimals: 0, status: s.seen.some((e) => e.severity === "alta") ? "alert" : "ok" },
    { id: "area", label: "Área afectada", value: s.area, unit: "%", decimals: 2, status: s.area > 2 ? "warn" : "ok" },
    { id: "severity", label: "Severidad máxima", value: sevValue, decimals: 0, status: sevValue === 3 ? "alert" : sevValue === 2 ? "warn" : "ok" },
    { id: "progress", label: "Avance de pasada", value: cameraU(state.data.passT) * 100, unit: "%", decimals: 0 },
  ];
}

export const inspeccionDef: ModuleDef<InspeccionData> = {
  id: "inspeccion",
  site: "parque-vega",
  init,
  step,
  observe,
  zones,
  kpis,
};
