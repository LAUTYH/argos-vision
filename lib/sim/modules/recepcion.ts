import { REMITOS, SKU_BY_CODE, SKU_UNDECLARED } from "@/lib/data/company";
import { clamp, dist, lerp, project, projectBox, type Camera } from "../camera";
import { hashRng } from "../rng";
import { UNDECLARED_AT } from "../timeline";
import type { BoxEntity, Entity, Kpi, Observable, PalletEntity, Vec2, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";
import { occlusionOf } from "./shared";

export const RECEPCION_CAM: Camera = { height: 2.9, pitch: 0.4, focal: 980, cx: 640, cy: 560 };

/** Conveyor geometry in floor metres (x lateral, y depth). */
export const BELT = {
  a: { x: -5.6, y: 14.2 },
  b: { x: 0.9, y: 3.6 },
  height: 0.82,
  width: 0.8,
  countS: 0.56,
  speed: 0.66,
};
export const BELT_LEN = dist(BELT.a, BELT.b);
export const BELT_ANGLE = Math.atan2(BELT.b.y - BELT.a.y, BELT.b.x - BELT.a.x);

export function beltPoint(s: number, lateral = 0): Vec2 {
  const x = lerp(BELT.a.x, BELT.b.x, s);
  const y = lerp(BELT.a.y, BELT.b.y, s);
  const nx = -Math.sin(BELT_ANGLE);
  const ny = Math.cos(BELT_ANGLE);
  return { x: x + nx * lateral, y: y + ny * lateral };
}

export const PALLET_SPOTS: Array<{ pos: Vec2; film: boolean; layers: number }> = [
  { pos: { x: 4.3, y: 9.2 }, film: true, layers: 4 },
  { pos: { x: 5.8, y: 9.5 }, film: false, layers: 3 },
  { pos: { x: 4.5, y: 11.3 }, film: true, layers: 5 },
  { pos: { x: 6.0, y: 11.6 }, film: false, layers: 2 },
  { pos: { x: 7.2, y: 10.4 }, film: true, layers: 4 },
];

interface QueueItem {
  sku: string;
  expected: boolean;
  damaged: boolean;
  open: boolean;
}

export interface RemitoTally {
  number: string;
  units: number;
  faltantes: number;
  sobrantes: number;
  undeclared: number;
}

export interface RecepcionData {
  remitoIdx: number;
  counts: Record<string, number>;
  unexpected: Record<string, number>;
  queue: QueueItem[];
  nextGap: number;
  lastSpawnId: number;
  countTimes: number[];
  done: boolean;
  doneAt: number;
  gapUntil: number;
  forceDamaged: number;
  history: RemitoTally[];
  completedLines: string[];
  /** Units on the truck that were never declared (undeclared SKU). */
  undeclaredCount: number;
}

const GAP_MEAN = 1.02;

function sampleGap(r: { gaussian: (m: number, s: number) => number }): number {
  return clamp(r.gaussian(GAP_MEAN, 0.2), 0.74, 1.7);
}

function buildQueue(ctx: InitCtx | StepCtx, remitoIdx: number, withUndeclared: boolean): QueueItem[] {
  const remito = REMITOS[remitoIdx % REMITOS.length];
  if (!remito) return [];
  const items: QueueItem[] = [];
  for (const line of remito.lines) {
    const pre = remito.preCounted[line.sku] ?? 0;
    for (let i = 0; i < line.actual - pre; i++) items.push({ sku: line.sku, expected: true, damaged: false, open: false });
  }
  const shuffled = ctx.rng.shuffle(items);
  shuffled.forEach((it, i) => {
    const h = hashRng(ctx.rng.state, "boxflags", remitoIdx, i);
    it.damaged = h.chance(0.065) || i === 5 || i === 11 || i === 24;
    it.open = !it.damaged && h.chance(0.03);
  });
  if (withUndeclared && remito.undeclared > 0) {
    // placed so it crosses the count line at UNDECLARED_AT seconds
    const countPos = BELT.countS * BELT_LEN;
    const travel = UNDECLARED_AT * BELT.speed;
    const beforeEntry = travel - countPos;
    let acc = -countPos;
    let idx = 0;
    for (let i = 0; i < shuffled.length; i++) {
      acc += GAP_MEAN;
      if (acc >= beforeEntry) {
        idx = i;
        break;
      }
      idx = i;
    }
    for (let u = 0; u < remito.undeclared; u++) {
      shuffled.splice(idx + u, 0, { sku: SKU_UNDECLARED.code, expected: false, damaged: false, open: false });
    }
  }
  return shuffled;
}

function makeBox(ctx: InitCtx | StepCtx, t: number, item: QueueItem, s: number): BoxEntity {
  const sku = SKU_BY_CODE[item.sku] ?? SKU_UNDECLARED;
  return {
    kind: "caja",
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    s,
    speed: BELT.speed * ctx.rng.float(0.995, 1.005),
    sku: item.sku,
    expected: item.expected,
    damaged: item.damaged,
    open: item.open,
    counted: false,
    dims: { ...sku.dims },
    tone: clamp(sku.tone + ctx.rng.float(-0.08, 0.08), 0, 1),
    lateral: ctx.rng.float(-0.1, 0.1),
    yaw: ctx.rng.float(-0.14, 0.14),
  };
}

function init(ctx: InitCtx): { data: RecepcionData; entities: Entity[] } {
  const remitoIdx = 0;
  const remito = REMITOS[0];
  if (!remito) throw new Error("no remito");
  const queue = buildQueue(ctx, remitoIdx, true);
  const entities: Entity[] = [];
  const counts: Record<string, number> = {};
  for (const line of remito.lines) counts[line.sku] = 0;

  // boxes already past the count line at t=0 (part of preCounted)
  const countPos = BELT.countS * BELT_LEN;
  let pos = countPos + sampleGap(ctx.rng) * 0.6;
  const preSkus = remito.lines.filter((l) => (remito.preCounted[l.sku] ?? 0) > 0).map((l) => l.sku);
  while (pos < BELT_LEN * 0.98) {
    const sku = ctx.rng.pick(preSkus);
    const b = makeBox(ctx, 0, { sku, expected: true, damaged: ctx.rng.chance(0.06), open: false }, pos / BELT_LEN);
    b.counted = true;
    entities.push(b);
    pos += sampleGap(ctx.rng);
  }
  // boxes on the belt before the count line
  let lastSpawnId = 0;
  let nextGap = sampleGap(ctx.rng);
  pos = countPos - nextGap;
  while (pos >= 0 && queue.length > 0) {
    const item = queue.shift() as QueueItem;
    const b = makeBox(ctx, 0, item, pos / BELT_LEN);
    entities.push(b);
    lastSpawnId = b.id;
    nextGap = sampleGap(ctx.rng);
    pos -= nextGap;
  }
  // pallets staged beside the belt
  PALLET_SPOTS.forEach((p) => {
    const pallet: PalletEntity = {
      kind: "pallet",
      id: ctx.id(),
      trackId: ctx.track(),
      born: 0,
      pos: { ...p.pos },
      film: p.film,
      layers: p.layers,
      tone: ctx.rng.float(0.3, 0.7),
    };
    entities.push(pallet);
  });

  // count history for the units/hour window (pre-counted units arrived at the same pace)
  const preTotal = Object.values(remito.preCounted).reduce((a, b) => a + b, 0);
  const countTimes: number[] = [];
  for (let i = 0; i < preTotal; i++) countTimes.push(-(preTotal - i) * (GAP_MEAN / BELT.speed) + ctx.rng.float(-0.3, 0.3));

  return {
    data: {
      remitoIdx,
      counts,
      unexpected: {},
      queue,
      nextGap,
      lastSpawnId,
      countTimes,
      done: false,
      doneAt: 0,
      gapUntil: 0,
      forceDamaged: 0,
      history: [],
      completedLines: [],
      undeclaredCount: 0,
    },
    entities,
  };
}

export function activeRemito(state: WorldState<RecepcionData>) {
  const r = REMITOS[state.data.remitoIdx % REMITOS.length];
  if (!r) throw new Error("no remito");
  return r;
}

export function skuTotal(state: WorldState<RecepcionData>, sku: string): number {
  const remito = activeRemito(state);
  return (remito.preCounted[sku] ?? 0) + (state.data.counts[sku] ?? 0);
}

function step(state: WorldState<RecepcionData>, ctx: StepCtx): void {
  const d = state.data;
  const remito = activeRemito(state);
  if (ctx.actions.includes("damaged-box")) d.forceDamaged += 1;

  const boxes: BoxEntity[] = [];
  for (const e of state.entities) if (e.kind === "caja") boxes.push(e);

  for (const b of boxes) {
    b.s += (b.speed * ctx.dt) / BELT_LEN;
    if (!b.counted && b.s >= BELT.countS) {
      b.counted = true;
      d.countTimes.push(ctx.t);
      if (d.countTimes.length > 600) d.countTimes.splice(0, d.countTimes.length - 600);
      if (b.expected) {
        d.counts[b.sku] = (d.counts[b.sku] ?? 0) + 1;
        const line = remito.lines.find((l) => l.sku === b.sku);
        if (line && skuTotal(state, b.sku) === line.expected && !d.completedLines.includes(b.sku)) {
          d.completedLines.push(b.sku);
          ctx.emit({
            severity: "info",
            kind: "count",
            title: `${b.sku} completo · ${line.expected}/${line.expected}`,
            detail: `${SKU_BY_CODE[b.sku]?.name ?? b.sku} · remito ${remito.number}`,
            entityId: b.id,
          });
        }
      } else {
        d.unexpected[b.sku] = (d.unexpected[b.sku] ?? 0) + 1;
        d.undeclaredCount += 1;
        ctx.emit({
          severity: "high",
          kind: "discrepancy",
          title: `SKU no declarado · ${b.sku}`,
          detail: `${SKU_BY_CODE[b.sku]?.name ?? b.sku} no figura en remito ${remito.number}`,
          entityId: b.id,
        });
      }
    }
  }
  state.entities = state.entities.filter((e) => e.kind !== "caja" || e.s < 1.06);

  // spawn from the queue keeping physical spacing
  if (d.queue.length > 0 && !d.done) {
    const last = state.entities.find((e) => e.id === d.lastSpawnId);
    const lastS = last && last.kind === "caja" ? last.s : 1;
    if (lastS * BELT_LEN >= d.nextGap) {
      const item = d.queue.shift() as QueueItem;
      if (d.forceDamaged > 0) {
        item.damaged = true;
        d.forceDamaged -= 1;
      }
      const b = makeBox(ctx, ctx.t, item, Math.max(0, lastS - d.nextGap / BELT_LEN));
      state.entities.push(b);
      d.lastSpawnId = b.id;
      d.nextGap = sampleGap(ctx.rng);
    }
  }

  // unloading complete
  if (!d.done && d.queue.length === 0 && boxes.every((b) => b.counted)) {
    d.done = true;
    d.doneAt = ctx.t;
    d.gapUntil = ctx.t + 26;
    let faltantes = 0;
    let sobrantes = 0;
    let units = 0;
    for (const line of remito.lines) {
      const total = skuTotal(state, line.sku);
      units += total;
      faltantes += Math.max(0, line.expected - total);
      sobrantes += Math.max(0, total - line.expected);
    }
    const undeclared = Object.values(d.unexpected).reduce((a, b) => a + b, 0);
    d.history.push({ number: remito.number, units, faltantes, sobrantes, undeclared });
    const diffs = faltantes + sobrantes + undeclared;
    ctx.emit({
      severity: diffs > 0 ? "medium" : "info",
      kind: "count",
      title: `Descarga completa · remito ${remito.number}`,
      detail:
        diffs > 0
          ? `${units} u. · ${faltantes} faltantes · ${sobrantes} sobrantes · ${undeclared} no declaradas`
          : `${units} u. · sin diferencias`,
    });
  }

  // next truck
  if (d.done && ctx.t >= d.gapUntil) {
    d.remitoIdx += 1;
    const next = activeRemito(state);
    d.counts = {};
    for (const line of next.lines) d.counts[line.sku] = 0;
    d.unexpected = {};
    d.queue = buildQueue(ctx, d.remitoIdx, false);
    d.done = false;
    d.completedLines = [];
    d.undeclaredCount = 0;
    d.lastSpawnId = 0;
    d.nextGap = sampleGap(ctx.rng);
    ctx.emit({
      severity: "info",
      kind: "doc",
      title: `Inicio de descarga · remito ${next.number}`,
      detail: `${next.supplier} · ${next.plate} · ${next.dock}`,
    });
  }
}

function observe(state: WorldState<RecepcionData>): Observable[] {
  const cam = RECEPCION_CAM;
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind === "caja") {
      if (e.s < -0.01 || e.s > 1.02) continue;
      const p = beltPoint(e.s, e.lateral);
      const box = projectBox(cam, p.x, BELT.height, p.y, e.dims.w, e.dims.h, e.dims.d, BELT_ANGLE + e.yaw);
      items.push({
        entityId: e.id,
        trackId: e.trackId,
        kind: "caja",
        box,
        depth: clamp(1 - e.s, 0, 1),
        occlusion: 0,
        attrs: { sku: e.sku, expected: e.expected, damaged: e.damaged, open: e.open },
      });
    } else if (e.kind === "pallet") {
      const h = 0.15 + e.layers * 0.3;
      const box = projectBox(cam, e.pos.x, 0, e.pos.y, 1.2, h, 1.0, 0.08);
      items.push({
        entityId: e.id,
        trackId: e.trackId,
        kind: "pallet",
        box,
        depth: clamp((e.pos.y - 3) / 12, 0, 1),
        occlusion: 0,
        attrs: { film: e.film },
      });
    }
  }
  const occ = occlusionOf(items);
  items.forEach((it, i) => {
    it.occlusion = occ[i] ?? 0;
  });
  return items;
}

const STAGING_FLOOR: Vec2[] = [
  { x: 3.5, y: 8.3 },
  { x: 8.1, y: 8.3 },
  { x: 8.1, y: 12.5 },
  { x: 3.5, y: 12.5 },
];

function zones(): Zone[] {
  const l = beltPoint(BELT.countS, -BELT.width * 0.75);
  const r = beltPoint(BELT.countS, BELT.width * 0.75);
  const a = project(RECEPCION_CAM, l.x, BELT.height, l.y);
  const b = project(RECEPCION_CAM, r.x, BELT.height, r.y);
  return [
    { id: "count", label: "Línea de conteo", kind: "line", points: [a, b] },
    {
      id: "pallets",
      label: "Staging pallets",
      kind: "area",
      floor: STAGING_FLOOR,
      points: STAGING_FLOOR.map((q) => project(RECEPCION_CAM, q.x, 0, q.y)),
    },
  ];
}

export function unitsPerHour(state: WorldState<RecepcionData>): number {
  const window = 90;
  const from = state.t - window;
  let n = 0;
  for (let i = state.data.countTimes.length - 1; i >= 0; i--) {
    const ct = state.data.countTimes[i] ?? -Infinity;
    if (ct <= from) break;
    n++;
  }
  return (n / window) * 3600;
}

export function tallies(state: WorldState<RecepcionData>) {
  const remito = activeRemito(state);
  let faltantes = 0;
  let sobrantes = 0;
  let total = 0;
  let expected = 0;
  for (const line of remito.lines) {
    const c = skuTotal(state, line.sku);
    total += c;
    expected += line.expected;
    faltantes += Math.max(0, line.expected - c);
    sobrantes += Math.max(0, c - line.expected);
  }
  const undeclared = Object.values(state.data.unexpected).reduce((a, b) => a + b, 0);
  const corrections = Math.floor(total * 0.006);
  const precision = total > 0 ? (1 - corrections / total) * 100 : 100;
  return { faltantes, sobrantes, undeclared, total, expected, precision, corrections };
}

function kpis(state: WorldState<RecepcionData>): Kpi[] {
  const t = tallies(state);
  return [
    { id: "uph", label: "Unidades / hora", value: unitsPerHour(state), unit: "u/h", decimals: 0 },
    { id: "precision", label: "Precisión de conteo", value: t.precision, unit: "%", decimals: 1, status: "ok" },
    {
      id: "faltantes",
      label: state.data.done ? "Faltantes" : "Pendientes",
      value: t.faltantes,
      unit: "u",
      decimals: 0,
      status: state.data.done && t.faltantes > 0 ? "alert" : "ok",
    },
    {
      id: "sobrantes",
      label: "Sobrantes",
      value: t.sobrantes + t.undeclared,
      unit: "u",
      decimals: 0,
      status: t.sobrantes + t.undeclared > 0 ? "warn" : "ok",
    },
  ];
}

export const recepcionDef: ModuleDef<RecepcionData> = {
  id: "recepcion",
  site: "cd-norte",
  init,
  step,
  observe,
  zones,
  kpis,
};
