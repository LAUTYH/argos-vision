import { OPERATORS } from "@/lib/data/company";
import { clamp, type Camera } from "../camera";
import { Rng } from "../rng";
import type { Entity, Kpi, Observable, PersonEntity, Vec2, Waypoint, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";
import { floorPoly, makePerson, occlusionOf, personView, projectTrail, stepPerson } from "./shared";

export const FLUJO_CAM: Camera = { height: 4.6, pitch: 0.36, focal: 820, cx: 640, cy: 459 };

export const FLOOR = { x0: -8, x1: 8, z0: 3.2, z1: 19.2 };
export const HEAT_COLS = 32;
export const HEAT_ROWS = 30;
export const COUNT_LINE = { z: 7.4, x0: -2.6, x1: 2.6 };

export interface FlowZone {
  id: string;
  label: string;
  rect: { x0: number; x1: number; z0: number; z1: number };
  capacity: number;
}

export const FLOW_ZONES: FlowZone[] = [
  { id: "pickA", label: "Picking A", rect: { x0: -7.2, x1: -3.0, z0: 8.6, z1: 13.4 }, capacity: 4 },
  { id: "pickB", label: "Picking B", rect: { x0: 3.0, x1: 7.2, z0: 8.6, z1: 13.4 }, capacity: 4 },
  { id: "packing", label: "Packing", rect: { x0: -3.4, x1: 3.4, z0: 14.4, z1: 17.6 }, capacity: 4 },
];

export interface ZoneStat {
  visits: number;
  totalSeconds: number;
  current: number;
}

export interface FlujoData {
  heat: Float32Array;
  entries: number;
  exits: number;
  zoneStats: Record<string, ZoneStat>;
  spawnCooldown: number;
  surgeLeft: number;
  surgeTimer: number;
  overCapacityFlag: Record<string, boolean>;
  crossedIds: number[];
}

const STAFF = OPERATORS.slice(7);

function zoneRectPoly(z: FlowZone): Vec2[] {
  const r = z.rect;
  return [
    { x: r.x0, y: r.z0 },
    { x: r.x1, y: r.z0 },
    { x: r.x1, y: r.z1 },
    { x: r.x0, y: r.z1 },
  ];
}

function insideZone(p: Vec2, z: FlowZone): boolean {
  return p.x >= z.rect.x0 && p.x <= z.rect.x1 && p.y >= z.rect.z0 && p.y <= z.rect.z1;
}

function zonePoint(rng: Rng, z: FlowZone, dwell: number): Waypoint {
  return {
    x: rng.float(z.rect.x0 + 0.5, z.rect.x1 - 0.5),
    y: rng.float(z.rect.z0 + 0.5, z.rect.z1 - 0.5),
    dwell,
  };
}

function buildRoute(rng: Rng, fromBack: boolean, forceZone?: string): { start: Vec2; route: Waypoint[] } {
  const start = fromBack ? { x: rng.float(-1.5, 1.5), y: 19.2 } : { x: rng.float(-1.7, 1.7), y: 3.2 };
  const route: Waypoint[] = [];
  const forced = forceZone ? FLOW_ZONES.filter((z) => z.id === forceZone) : [];
  const zonesToVisit = forced.length ? forced : rng.shuffle(FLOW_ZONES).slice(0, rng.int(1, 2));
  for (const z of zonesToVisit) {
    const stops = rng.int(2, 4);
    for (let i = 0; i < stops; i++) route.push(zonePoint(rng, z, rng.float(2.5, 9)));
  }
  const exitBack = rng.chance(0.35);
  route.push(exitBack ? { x: rng.float(-1.5, 1.5), y: 19.2 } : { x: rng.float(-1.7, 1.7), y: 3.0 });
  return { start, route };
}

function spawn(ctx: InitCtx | StepCtx, t: number, fromBack: boolean, forceZone?: string): PersonEntity {
  const who = ctx.rng.pick(STAFF);
  const rr = buildRoute(ctx.rng, fromBack, forceZone);
  return makePerson({
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    pos: rr.start,
    route: rr.route,
    name: who.name,
    role: who.role,
    helmet: true,
    vest: !ctx.rng.chance(0.15),
    height: ctx.rng.float(1.6, 1.86),
    speed: ctx.rng.float(1.05, 1.4),
    shirt: ctx.rng.next(),
  });
}

function stepCore(state: WorldState<FlujoData>, ctx: StepCtx, emit: boolean): void {
  const d = state.data;
  const people: PersonEntity[] = [];
  for (const e of state.entities) if (e.kind === "persona") people.push(e);

  if (ctx.actions.includes("surge")) {
    d.surgeLeft = 5;
    d.surgeTimer = 0;
    // Everyone in the surge heads for the same zone, which is what actually
    // breaches the aforo a few seconds later.
    if (emit) ctx.emit({ severity: "low", kind: "flow", title: "Pico de ingreso · 5 personas hacia Picking B", detail: "Ingreso simultáneo por pasillo central · aforo de la zona en 4" });
  }
  if (d.surgeLeft > 0) {
    d.surgeTimer -= ctx.dt;
    if (d.surgeTimer <= 0) {
      state.entities.push(spawn(ctx, ctx.t, false, "pickB"));
      d.surgeLeft -= 1;
      d.surgeTimer = 0.55;
    }
  }

  d.spawnCooldown -= ctx.dt;
  if (people.length < 7 && d.spawnCooldown <= 0) {
    state.entities.push(spawn(ctx, ctx.t, ctx.rng.chance(0.3)));
    d.spawnCooldown = ctx.rng.float(3, 9);
  }

  const cellW = (FLOOR.x1 - FLOOR.x0) / HEAT_COLS;
  const cellH = (FLOOR.z1 - FLOOR.z0) / HEAT_ROWS;
  const gone: number[] = [];
  for (const z of FLOW_ZONES) {
    const st = d.zoneStats[z.id];
    if (st) st.current = 0;
  }
  for (const p of people) {
    const prevZ = p.pos.y;
    const r = stepPerson(p, ctx.dt, people, ctx.rng);
    if (r === "done") {
      gone.push(p.id);
      continue;
    }
    // counting line
    const crossed = (prevZ < COUNT_LINE.z && p.pos.y >= COUNT_LINE.z) || (prevZ >= COUNT_LINE.z && p.pos.y < COUNT_LINE.z);
    if (crossed && p.pos.x > COUNT_LINE.x0 - 0.5 && p.pos.x < COUNT_LINE.x1 + 0.5) {
      if (p.pos.y >= COUNT_LINE.z) d.entries += 1;
      else d.exits += 1;
    }
    // heat
    const cx = Math.floor((p.pos.x - FLOOR.x0) / cellW);
    const cz = Math.floor((p.pos.y - FLOOR.z0) / cellH);
    if (cx >= 0 && cx < HEAT_COLS && cz >= 0 && cz < HEAT_ROWS) {
      const idx = cz * HEAT_COLS + cx;
      d.heat[idx] = (d.heat[idx] ?? 0) + ctx.dt;
    }
    // zones
    let zoneId: string | null = null;
    for (const z of FLOW_ZONES) if (insideZone(p.pos, z)) zoneId = z.id;
    if (zoneId !== p.zone) {
      if (p.zone) {
        const st = d.zoneStats[p.zone];
        if (st) {
          st.visits += 1;
          st.totalSeconds += ctx.t - p.zoneSince;
        }
      }
      p.zone = zoneId;
      p.zoneSince = ctx.t;
    }
    if (zoneId) {
      const st = d.zoneStats[zoneId];
      if (st) st.current += 1;
    }
  }
  if (gone.length) state.entities = state.entities.filter((e) => !gone.includes(e.id));

  // capacity warnings
  for (const z of FLOW_ZONES) {
    const st = d.zoneStats[z.id];
    if (!st) continue;
    const over = st.current > z.capacity;
    if (over && !d.overCapacityFlag[z.id]) {
      d.overCapacityFlag[z.id] = true;
      if (emit) ctx.emit({ severity: "medium", kind: "flow", title: `Aforo excedido · ${z.label}`, detail: `${st.current} personas · capacidad ${z.capacity}` });
    } else if (!over && d.overCapacityFlag[z.id]) {
      d.overCapacityFlag[z.id] = false;
    }
  }

  // slow heat decay (half-life ≈ 4 min) keeps the map alive
  if (state.step % 60 === 0) {
    const k = Math.pow(0.5, 1 / 240);
    for (let i = 0; i < d.heat.length; i++) d.heat[i] = (d.heat[i] ?? 0) * k;
  }
}

function init(ctx: InitCtx): { data: FlujoData; entities: Entity[] } {
  const data: FlujoData = {
    heat: new Float32Array(HEAT_COLS * HEAT_ROWS),
    entries: 212,
    exits: 198,
    zoneStats: {
      pickA: { visits: 61, totalSeconds: 21960, current: 0 },
      pickB: { visits: 54, totalSeconds: 17280, current: 0 },
      packing: { visits: 88, totalSeconds: 15840, current: 0 },
    },
    spawnCooldown: 0,
    surgeLeft: 0,
    surgeTimer: 0,
    overCapacityFlag: {},
    crossedIds: [],
  };
  // Warm the floor up: 100 s of activity so the heatmap and trails exist at t=0.
  const state: WorldState<FlujoData> = {
    seed: ctx.seed,
    t: 0,
    step: 0,
    rng: ctx.rng.state,
    nextId: 0,
    nextTrack: 0,
    nextEventId: 0,
    entities: [],
    events: [],
    tick: 0,
    tickT: 0,
    nextTickAt: 0,
    lastLatency: 0,
    lastBoxes: 0,
    data,
  };
  const dt = 1 / 30;
  const warm = 100;
  const entriesBefore = data.entries;
  const exitsBefore = data.exits;
  for (let i = 0; i < warm * 30; i++) {
    const t = -warm + i * dt;
    const stepCtx: StepCtx = {
      rng: ctx.rng,
      dt,
      t,
      actions: [],
      emit: () => undefined,
      id: ctx.id,
      track: ctx.track,
    };
    stepCore(state, stepCtx, false);
    state.step += 1;
  }
  data.entries = entriesBefore;
  data.exits = exitsBefore;
  for (const e of state.entities) if (e.kind === "persona") e.born = Math.min(e.born, 0);
  return { data, entities: state.entities };
}

function step(state: WorldState<FlujoData>, ctx: StepCtx): void {
  stepCore(state, ctx, true);
}

function observe(state: WorldState<FlujoData>): Observable[] {
  const cam = FLUJO_CAM;
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind !== "persona") continue;
    if (e.pos.y < 3.1 || e.pos.y > 19.0) continue;
    const v = personView(cam, e);
    const zoneLabel = e.zone ? (FLOW_ZONES.find((z) => z.id === e.zone)?.label ?? null) : null;
    items.push({
      entityId: e.id,
      trackId: e.trackId,
      kind: "persona",
      box: v.box,
      depth: clamp((e.pos.y - 2) / 16, 0, 1),
      occlusion: 0,
      pose: v.pose,
      head: v.head,
      torso: v.torso,
      trail: projectTrail(cam, e.trail),
      attrs: { helmet: e.helmet, vest: e.vest, name: e.name, role: e.role, zone: zoneLabel },
    });
  }
  const occ = occlusionOf(items);
  items.forEach((it, i) => {
    it.occlusion = occ[i] ?? 0;
  });
  return items;
}

function zones(): Zone[] {
  const out: Zone[] = FLOW_ZONES.map((z) => ({
    id: z.id,
    label: z.label,
    kind: "area",
    floor: zoneRectPoly(z),
    points: floorPoly(FLUJO_CAM, zoneRectPoly(z)),
  }));
  out.push({
    id: "line",
    label: "Línea de conteo",
    kind: "line",
    floor: [
      { x: COUNT_LINE.x0, y: COUNT_LINE.z },
      { x: COUNT_LINE.x1, y: COUNT_LINE.z },
    ],
    points: floorPoly(FLUJO_CAM, [
      { x: COUNT_LINE.x0, y: COUNT_LINE.z },
      { x: COUNT_LINE.x1, y: COUNT_LINE.z },
    ]),
  });
  return out;
}

export function meanDwellMinutes(state: WorldState<FlujoData>): number {
  let visits = 0;
  let total = 0;
  for (const st of Object.values(state.data.zoneStats)) {
    visits += st.visits;
    total += st.totalSeconds;
  }
  return visits > 0 ? total / visits / 60 : 0;
}

function kpis(state: WorldState<FlujoData>): Kpi[] {
  const d = state.data;
  const people = state.entities.filter((e) => e.kind === "persona").length;
  return [
    { id: "people", label: "Personas en escena", value: people, decimals: 0 },
    { id: "entries", label: "Entradas · turno", value: d.entries, decimals: 0 },
    { id: "exits", label: "Salidas · turno", value: d.exits, decimals: 0 },
    { id: "dwell", label: "Permanencia media", value: meanDwellMinutes(state), unit: "min", decimals: 1 },
  ];
}

export const flujoDef: ModuleDef<FlujoData> = {
  id: "flujo",
  site: "cd-norte",
  init,
  step,
  observe,
  zones,
  kpis,
};
