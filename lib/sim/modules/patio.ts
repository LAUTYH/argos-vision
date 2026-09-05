import { DOCK_COUNT, FORKLIFTS, OPERATORS, TRUCK_PLATES } from "@/lib/data/company";
import { angleLerp, clamp, dist, pointInPoly } from "../camera";
import type { Entity, Kpi, Observable, PersonEntity, Vec2, VehicleEntity, Waypoint, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";
import { makePerson, stepPerson } from "./shared";

/**
 * Top-down yard. World units are metres; the scene is 64 × 36 m mapped to
 * 1280 × 720 px (20 px/m).
 */
export const PX_PER_M = 20;
export const YARD = { w: 64, h: 36 };
export const BUILDING = { y0: 0, y1: 5.5 };
export const DOCK_X = Array.from({ length: DOCK_COUNT }, (_, i) => 7 + i * 7);
export const DOCK_W = 3.4;
export const TRUCK = { length: 13.6, width: 2.6, cab: 2.4 };
export const DOCKED_Y = BUILDING.y1 + TRUCK.length / 2;
export const TRUCK_LANE = { y0: 21.2, y1: 26.2, center: 23.7 };
export const WALKWAY = { y0: 19.5, y1: 21.0, center: 20.25 };
export const STAGING = { x0: 3, x1: 33, y0: 27.5, y1: 34 };
export const GATEHOUSE = { x0: 60.5, x1: 64, y0: 17.5, y1: 22.5 };
export const OFFICE = { x0: 0, x1: 2.2, y0: 17.5, y1: 22.5 };
export const CROSSING = { x0: 11.6, x1: 17.4, y0: 18.8, y1: 27.2 };
export const LANE_N = 13.2; // northbound forklift lane x
export const LANE_S = 15.8; // southbound forklift lane x

export const PALLET_BLOCKS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 5, y: 28.5, w: 2.4, h: 1.2 },
  { x: 8, y: 28.5, w: 2.4, h: 1.2 },
  { x: 5, y: 30.4, w: 2.4, h: 1.2 },
  { x: 8, y: 30.4, w: 2.4, h: 1.2 },
  { x: 5, y: 32.3, w: 2.4, h: 1.2 },
  { x: 20, y: 28.5, w: 2.4, h: 1.2 },
  { x: 23, y: 28.5, w: 2.4, h: 1.2 },
  { x: 26, y: 28.5, w: 2.4, h: 1.2 },
  { x: 20, y: 30.4, w: 2.4, h: 1.2 },
  { x: 26, y: 30.4, w: 2.4, h: 1.2 },
  { x: 23, y: 32.3, w: 2.4, h: 1.2 },
  { x: 29, y: 32.3, w: 2.4, h: 1.2 },
];

export const CROSSING_POLY: Vec2[] = [
  { x: CROSSING.x0, y: CROSSING.y0 },
  { x: CROSSING.x1, y: CROSSING.y0 },
  { x: CROSSING.x1, y: CROSSING.y1 },
  { x: CROSSING.x0, y: CROSSING.y1 },
];

export interface DockState {
  truckId: number;
  since: number;
  plannedStay: number;
}

export interface PatioData {
  docks: DockState[];
  crossingRisks: number;
  wrongWayEvents: number;
  dockVisits: number;
  dockMinutesTotal: number;
  truckSpawnAt: number;
  pedSpawnAt: number;
  lastRiskT: Record<string, number>;
  arrivalsToday: number;
}

const YARD_STAFF = OPERATORS.slice(10);

function truck(ctx: InitCtx | StepCtx, t: number, plate: string, driver: string, route: Waypoint[], pos: Vec2, heading: number, state: VehicleEntity["state"]): VehicleEntity {
  return {
    kind: "camion",
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    pos: { ...pos },
    heading,
    speed: 0,
    targetSpeed: 3.4,
    route,
    wp: 0,
    state,
    dock: -1,
    code: plate,
    plate,
    operator: driver,
    dwell: 0,
    carrying: true,
    wrongWay: false,
    inPedestrian: false,
    tone: ctx.rng.next(),
    length: TRUCK.length,
    width: TRUCK.width,
    trail: [],
    trailAcc: 0,
  };
}

function forklift(ctx: InitCtx | StepCtx, t: number, idx: number, pos: Vec2): VehicleEntity {
  const f = FORKLIFTS[idx] ?? FORKLIFTS[0];
  return {
    kind: "montacarga",
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    pos: { ...pos },
    heading: -Math.PI / 2,
    speed: 0,
    targetSpeed: 2.6,
    route: [],
    wp: 0,
    state: "waiting",
    dock: -1,
    code: f.code,
    plate: "",
    operator: f.operator,
    dwell: ctx.rng.float(1, 4),
    carrying: false,
    wrongWay: false,
    inPedestrian: false,
    tone: ctx.rng.next(),
    length: 2.6,
    width: 1.2,
    trail: [],
    trailAcc: 0,
  };
}

function stagingPoint(ctx: InitCtx | StepCtx): Vec2 {
  const b = ctx.rng.pick(PALLET_BLOCKS);
  return { x: b.x + b.w / 2 + ctx.rng.float(-0.4, 0.4), y: b.y - 1.1 };
}

/** Forklift round trip: staging → north lane → apron → back through the south lane. */
function forkliftRoute(ctx: InitCtx | StepCtx, state: WorldState<PatioData> | null, opts: { wrongWay?: boolean } = {}): Waypoint[] {
  const start = stagingPoint(ctx);
  const dockedDocks = state ? state.data.docks.map((d, i) => (d.truckId > 0 ? i : -1)).filter((i) => i >= 0) : [2, 4];
  const dockIdx = dockedDocks.length > 0 ? ctx.rng.pick(dockedDocks) : ctx.rng.int(0, DOCK_COUNT - 1);
  const dockX = DOCK_X[dockIdx] ?? 21;
  const target = { x: dockX + (dockX > 20 ? -2.9 : 2.9), y: 14 + ctx.rng.float(-1.5, 1.5) };
  const upLane = opts.wrongWay ? LANE_S : LANE_N;
    return [
    { x: start.x, y: start.y, dwell: ctx.rng.float(3, 7) },
    { x: upLane, y: STAGING.y0 - 0.4 },
    { x: upLane, y: TRUCK_LANE.y1 + 0.2 },
    { x: upLane, y: WALKWAY.y0 - 0.9 },
    { x: target.x, y: target.y, dwell: ctx.rng.float(6, 12) },
    { x: LANE_S, y: WALKWAY.y0 - 0.9 },
    { x: LANE_S, y: TRUCK_LANE.y1 + 0.2 },
    { x: LANE_S, y: STAGING.y0 - 0.4 },
  ];
}

function dockRoute(dockIdx: number, fromX: number): Waypoint[] {
  const x = DOCK_X[dockIdx] ?? 21;
  return [
    { x: fromX, y: TRUCK_LANE.center },
    { x: x + 8.5, y: TRUCK_LANE.center },
    { x: x + 3.2, y: 20.6 },
    { x: x + 0.6, y: 17.2 },
    { x, y: DOCKED_Y },
  ];
}

function leaveRoute(dockIdx: number): Waypoint[] {
  const x = DOCK_X[dockIdx] ?? 21;
  return [
    { x: x + 0.6, y: 17.5 },
    { x: x + 3.4, y: 20.8 },
    { x: x - 6, y: TRUCK_LANE.center },
    { x: -12, y: TRUCK_LANE.center },
  ];
}

function pedestrian(ctx: InitCtx | StepCtx, t: number, fromLeft: boolean): PersonEntity {
  const who = ctx.rng.pick(YARD_STAFF);
  const start = fromLeft ? { x: OFFICE.x1 + 0.2, y: WALKWAY.center } : { x: GATEHOUSE.x0 - 0.2, y: WALKWAY.center };
  const end = fromLeft ? { x: GATEHOUSE.x0 - 0.2, y: WALKWAY.center } : { x: OFFICE.x1 + 0.2, y: WALKWAY.center };
  return makePerson({
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    pos: start,
    route: [{ x: (start.x + end.x) / 2 + ctx.rng.float(-6, 6), y: WALKWAY.center + ctx.rng.float(-0.3, 0.3) }, end],
    name: who.name,
    role: who.role,
    helmet: true,
    vest: true,
    height: 1.72,
    speed: ctx.rng.float(1.1, 1.4),
    shirt: ctx.rng.next(),
  });
}

function init(ctx: InitCtx): { data: PatioData; entities: Entity[] } {
  const entities: Entity[] = [];
  const docks: DockState[] = Array.from({ length: DOCK_COUNT }, () => ({ truckId: 0, since: 0, plannedStay: 0 }));
  const plates = ctx.rng.shuffle(TRUCK_PLATES);
  const drivers = ["H. Cáceres", "R. Villalba", "N. Paz", "E. Torres", "M. Duarte", "L. Aguirre", "S. Vega", "J. Núñez"];
  let p = 0;
  // docked trucks
  for (const i of [0, 2, 3, 5, 6]) {
    const x = DOCK_X[i] ?? 0;
    const tr = truck(ctx, -300, plates[p] ?? "AA 000 AA", drivers[p] ?? "—", [], { x, y: DOCKED_Y }, Math.PI / 2, "docked");
    tr.dock = i;
    tr.dwell = ctx.rng.float(40, 150);
    entities.push(tr);
    docks[i] = { truckId: tr.id, since: -ctx.rng.float(300, 2200), plannedStay: tr.dwell };
    p++;
  }
  // one truck backing into dock 4
  {
    const i = 4;
    const tr = truck(ctx, -20, plates[p] ?? "AA 000 AA", drivers[p] ?? "—", dockRoute(i, 70).slice(2), { x: (DOCK_X[i] ?? 0) + 3.2, y: 20.6 }, Math.PI, "docking");
    tr.dock = i;
    tr.targetSpeed = 1.1;
    entities.push(tr);
    docks[i] = { truckId: tr.id, since: 0, plannedStay: ctx.rng.float(60, 140) };
    p++;
  }
  // one truck arriving along the lane
  {
    const tr = truck(ctx, -5, plates[p] ?? "AA 000 AA", drivers[p] ?? "—", [{ x: 52, y: TRUCK_LANE.center }], { x: 70, y: TRUCK_LANE.center }, Math.PI, "moving");
    entities.push(tr);
    p++;
  }
  // forklifts
  for (let i = 0; i < 3; i++) {
    const f = forklift(ctx, -60, i, stagingPoint(ctx));
    f.route = forkliftRoute(ctx, null);
    f.wp = i === 0 ? 0 : i === 1 ? 1 : 6;
    if (i === 1) f.pos = { x: LANE_N, y: 30.5 };
    if (i === 2) {
      f.pos = { x: LANE_S, y: 21.5 };
      f.heading = Math.PI / 2;
      f.carrying = true;
    }
    f.state = "moving";
    entities.push(f);
  }
  const parked = forklift(ctx, -600, 3, { x: 31.5, y: 33.2 });
  parked.heading = Math.PI;
  parked.dwell = 1e9;
  entities.push(parked);
  // pedestrians
  const ped1 = pedestrian(ctx, -30, false);
  ped1.pos = { x: 44, y: WALKWAY.center };
  entities.push(ped1);

  return {
    data: {
      docks,
      crossingRisks: 4,
      wrongWayEvents: 1,
      dockVisits: 11,
      dockMinutesTotal: 418,
      truckSpawnAt: 48,
      pedSpawnAt: 14,
      lastRiskT: {},
      arrivalsToday: 17,
    },
    entities,
  };
}

function freeDock(state: WorldState<PatioData>, ctx: StepCtx): number {
  const free = state.data.docks.map((d, i) => (d.truckId === 0 ? i : -1)).filter((i) => i >= 0);
  return free.length ? ctx.rng.pick(free) : -1;
}

function followRoute(v: VehicleEntity, dt: number, reverse: boolean): boolean {
  const target = v.route[v.wp];
  if (!target) return true;
  const d = dist(v.pos, target);
  if (d < 0.35) {
    v.wp += 1;
    if (target.dwell) v.dwell = target.dwell;
    return v.wp >= v.route.length;
  }
  const desired = Math.atan2(target.y - v.pos.y, target.x - v.pos.x);
  const facing = reverse ? desired + Math.PI : desired;
  v.heading = angleLerp(v.heading, facing, 1 - Math.exp(-dt * (reverse ? 1.6 : 2.8)));
  const slow = d < 2 ? Math.max(0.3, d / 2) : 1;
  v.speed += (v.targetSpeed * slow - v.speed) * (1 - Math.exp(-dt * 2.5));
  const step = Math.min(v.speed * dt, d);
  v.pos = { x: v.pos.x + Math.cos(desired) * step, y: v.pos.y + Math.sin(desired) * step };
  return false;
}

/**
 * Trails record motion, so a parked vehicle drops its history instead of
 * leaving a permanent line across the yard.
 */
function sampleTrail(v: VehicleEntity, dt: number): void {
  v.trailAcc += dt;
  if (v.trailAcc < 0.2) return;
  v.trailAcc -= 0.2;
  if (v.speed > 0.25) {
    v.trail.push({ x: v.pos.x, y: v.pos.y });
    if (v.trail.length > 40) v.trail.shift();
  } else if (v.trail.length > 0) {
    v.trail.shift();
  }
}

function step(state: WorldState<PatioData>, ctx: StepCtx): void {
  const d = state.data;
  const vehicles: VehicleEntity[] = [];
  const people: PersonEntity[] = [];
  for (const e of state.entities) {
    if (e.kind === "montacarga" || e.kind === "camion") vehicles.push(e);
    else if (e.kind === "persona") people.push(e);
  }
  const forklifts = vehicles.filter((v) => v.kind === "montacarga");

  for (const action of ctx.actions) {
    if (action === "forklift-pedestrian") {
      // MC-03 heads straight through the crossing while a pedestrian walks into it
      const f = forklifts.find((v) => v.code === "MC-03") ?? forklifts[0];
      if (f) {
        f.route = [
          { x: LANE_N, y: STAGING.y0 - 0.4 },
          { x: LANE_N, y: TRUCK_LANE.y1 + 0.2 },
          { x: LANE_N, y: WALKWAY.y0 - 0.9 },
          { x: (DOCK_X[2] ?? 21) + 2.9, y: 14, dwell: 8 },
          { x: LANE_S, y: WALKWAY.y0 - 0.9 },
          { x: LANE_S, y: TRUCK_LANE.y1 + 0.2 },
          { x: LANE_S, y: STAGING.y0 - 0.4 },
          { x: 9, y: 27.4, dwell: 5 },
        ];
        f.wp = 0;
        f.dwell = 0;
        f.state = "moving";
        f.carrying = true;
        f.targetSpeed = 2.4;
        if (f.pos.y < STAGING.y0 - 1) f.pos = { x: LANE_N, y: STAGING.y0 + 0.2 };
      }
      const ped = pedestrian(ctx, ctx.t, false);
      ped.pos = { x: CROSSING.x1 + 5.2, y: WALKWAY.center };
      ped.route = [{ x: CROSSING.x0 - 4, y: WALKWAY.center }, { x: OFFICE.x1 + 0.2, y: WALKWAY.center }];
      ped.targetSpeed = 1.25;
      state.entities.push(ped);
    } else if (action === "wrong-way") {
      const f = forklifts.find((v) => v.code === "MC-01") ?? forklifts[0];
      if (f) {
        f.route = forkliftRoute(ctx, state, { wrongWay: true });
        f.wp = 1;
        f.dwell = 0;
        f.state = "moving";
        if (f.pos.y < STAGING.y0 - 1) f.pos = { x: LANE_S, y: STAGING.y0 + 0.2 };
      }
    }
  }

  // trucks
  d.truckSpawnAt -= ctx.dt;
  if (d.truckSpawnAt <= 0) {
    const arriving = vehicles.filter((v) => v.kind === "camion" && (v.state === "moving" || v.state === "waiting")).length;
    if (arriving < 2) {
      const plate = ctx.rng.pick(TRUCK_PLATES);
      const tr = truck(ctx, ctx.t, plate, ctx.rng.pick(["H. Cáceres", "R. Villalba", "N. Paz", "E. Torres", "M. Duarte"]), [{ x: 52, y: TRUCK_LANE.center }], { x: 72, y: TRUCK_LANE.center }, Math.PI, "moving");
      state.entities.push(tr);
      d.arrivalsToday += 1;
      ctx.emit({ severity: "info", kind: "yard", title: `Ingreso de camión · ${plate}`, detail: "Portería norte · en espera de dársena" });
    }
    d.truckSpawnAt = ctx.rng.float(45, 110);
  }

  const gone: number[] = [];
  for (const v of vehicles) {
    sampleTrail(v, ctx.dt);
    if (v.kind === "camion") {
      if (v.state === "moving") {
        const done = followRoute(v, ctx.dt, false);
        if (done) {
          const dock = freeDock(state, ctx);
          if (dock >= 0) {
            v.dock = dock;
            v.state = "docking";
            v.targetSpeed = 1.1;
            v.route = dockRoute(dock, v.pos.x).slice(1);
            v.wp = 0;
            d.docks[dock] = { truckId: v.id, since: ctx.t, plannedStay: ctx.rng.float(70, 160) };
            ctx.emit({ severity: "info", kind: "yard", title: `Asignación de dársena · D${dock + 1}`, detail: `${v.plate} · chofer ${v.operator}` });
          } else {
            v.state = "waiting";
            v.dwell = 8;
          }
        }
      } else if (v.state === "waiting") {
        v.speed = 0;
        v.dwell -= ctx.dt;
        if (v.dwell <= 0) {
          v.state = "moving";
          v.route = [{ x: v.pos.x - 0.1, y: TRUCK_LANE.center }];
          v.wp = 0;
        }
      } else if (v.state === "docking") {
        const done = followRoute(v, ctx.dt, true);
        if (done) {
          v.state = "docked";
          v.heading = Math.PI / 2;
          v.speed = 0;
          const ds = d.docks[v.dock];
          v.dwell = ds ? ds.plannedStay : 90;
          ctx.emit({ severity: "info", kind: "yard", title: `Camión en dársena D${v.dock + 1}`, detail: `${v.plate} · inicio de descarga` });
        }
      } else if (v.state === "docked") {
        v.speed = 0;
        v.dwell -= ctx.dt;
        if (v.dwell <= 0) {
          v.state = "leaving";
          v.targetSpeed = 2.2;
          v.route = leaveRoute(v.dock);
          v.wp = 0;
          const ds = d.docks[v.dock];
          const minutes = ds ? Math.max(12, (ctx.t - ds.since) / 60 + 28) : 30;
          d.dockVisits += 1;
          d.dockMinutesTotal += minutes;
          d.docks[v.dock] = { truckId: 0, since: 0, plannedStay: 0 };
          ctx.emit({ severity: "info", kind: "yard", title: `Dársena D${v.dock + 1} liberada`, detail: `${v.plate} · ${Math.round(minutes)} min en dársena` });
          v.dock = -1;
        }
      } else if (v.state === "leaving") {
        v.targetSpeed = v.wp >= 2 ? 3.4 : 1.6;
        const done = followRoute(v, ctx.dt, false);
        if (done || v.pos.x < -8) gone.push(v.id);
      }
    } else {
      // forklifts
      if (v.dwell > 0) {
        v.dwell -= ctx.dt;
        v.speed = Math.max(0, v.speed - ctx.dt * 4);
        if (v.dwell <= 0 && v.route.length === 0) {
          v.route = forkliftRoute(ctx, state);
          v.wp = 1;
          v.carrying = !v.carrying;
        }
      } else if (v.route.length > 0) {
        v.targetSpeed = v.carrying ? 2.1 : 2.7;
        const done = followRoute(v, ctx.dt, false);
        const wpTarget = v.route[v.wp];
        if (wpTarget && wpTarget.dwell && dist(v.pos, wpTarget) < 0.4) v.carrying = !v.carrying;
        if (done) {
          v.route = [];
          v.dwell = ctx.rng.float(2, 6);
        }
      }
      // wrong-way: moving north (heading up) inside the southbound lane or south inside the northbound lane
      const movingUp = Math.sin(v.heading) < -0.5 && v.speed > 0.5;
      const movingDown = Math.sin(v.heading) > 0.5 && v.speed > 0.5;
      const inLaneS = Math.abs(v.pos.x - LANE_S) < 1.1 && v.pos.y > WALKWAY.y0 - 1 && v.pos.y < STAGING.y0;
      const inLaneN = Math.abs(v.pos.x - LANE_N) < 1.1 && v.pos.y > WALKWAY.y0 - 1 && v.pos.y < STAGING.y0;
      const wrong = (movingUp && inLaneS) || (movingDown && inLaneN);
      if (wrong && !v.wrongWay) {
        d.wrongWayEvents += 1;
        ctx.emit({ severity: "medium", kind: "yard", title: `Contramano · ${v.code}`, detail: `${v.operator} · carril de montacargas`, entityId: v.id });
      }
      v.wrongWay = wrong;
      v.inPedestrian = pointInPoly(v.pos, CROSSING_POLY) && v.speed > 0.3;
    }
  }

  // pedestrians
  d.pedSpawnAt -= ctx.dt;
  if (d.pedSpawnAt <= 0) {
    if (people.length < 2) state.entities.push(pedestrian(ctx, ctx.t, ctx.rng.chance(0.5)));
    d.pedSpawnAt = ctx.rng.float(20, 45);
  }
  for (const p of people) {
    const r = stepPerson(p, ctx.dt, people, ctx.rng, 0.2);
    if (r === "done") gone.push(p.id);
  }

  // crossing risk: forklift vs pedestrian, predicted 2 s ahead
  for (const f of forklifts) {
    if (f.speed < 0.4) continue;
    const fvx = Math.cos(f.heading) * f.speed;
    const fvy = Math.sin(f.heading) * f.speed;
    for (const p of people) {
      const pvx = Math.cos(p.heading) * p.speed;
      const pvy = Math.sin(p.heading) * p.speed;
      let minD = Infinity;
      for (let k = 0; k <= 8; k++) {
        const tt = k * 0.25;
        const dx = f.pos.x + fvx * tt - (p.pos.x + pvx * tt);
        const dy = f.pos.y + fvy * tt - (p.pos.y + pvy * tt);
        minD = Math.min(minD, Math.hypot(dx, dy));
      }
      if (minD < 1.9 && p.speed > 0.3) {
        const key = `${f.code}:${p.id}`;
        const last = d.lastRiskT[key] ?? -100;
        if (ctx.t - last > 45) {
          d.lastRiskT[key] = ctx.t;
          d.crossingRisks += 1;
          ctx.emit({
            severity: pointInPoly(f.pos, CROSSING_POLY) ? "high" : "medium",
            kind: "crossing",
            title: `Riesgo de cruce · ${f.code} y peatón`,
            detail: `${p.name} · distancia mínima prevista ${minD.toFixed(1)} m · zona peatonal`,
            entityId: f.id,
          });
        }
      }
    }
  }

  if (gone.length) state.entities = state.entities.filter((e) => !gone.includes(e.id));
}

function rectBox(pos: Vec2, len: number, wid: number, heading: number) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const hx = (Math.abs(c) * len + Math.abs(s) * wid) / 2;
  const hy = (Math.abs(s) * len + Math.abs(c) * wid) / 2;
  return { x: (pos.x - hx) * PX_PER_M, y: (pos.y - hy) * PX_PER_M, w: hx * 2 * PX_PER_M, h: hy * 2 * PX_PER_M };
}

function observe(state: WorldState<PatioData>): Observable[] {
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind === "camion" || e.kind === "montacarga") {
      const box = rectBox(e.pos, e.length, e.width, e.heading);
      if (box.x + box.w < 0 || box.x > 1280) continue;
      items.push({
        entityId: e.id,
        trackId: e.trackId,
        kind: e.kind,
        box,
        depth: 0.2,
        occlusion: 0,
        trail: e.trail.map((q) => ({ x: q.x * PX_PER_M, y: q.y * PX_PER_M })),
        attrs: {
          code: e.code,
          plate: e.plate,
          state: e.state,
          carrying: e.carrying,
          wrongWay: e.wrongWay,
          inPedestrian: e.inPedestrian,
          dock: e.dock,
          name: e.operator,
        },
      });
    } else if (e.kind === "persona") {
      const box = { x: (e.pos.x - 0.35) * PX_PER_M, y: (e.pos.y - 0.35) * PX_PER_M, w: 0.7 * PX_PER_M, h: 0.7 * PX_PER_M };
      items.push({
        entityId: e.id,
        trackId: e.trackId,
        kind: "persona",
        box,
        depth: 0.35,
        occlusion: 0,
        trail: e.trail.map((q) => ({ x: q.x * PX_PER_M, y: q.y * PX_PER_M })),
        attrs: { name: e.name, role: e.role, helmet: true, vest: true, inPedestrian: pointInPoly(e.pos, CROSSING_POLY) },
      });
    }
  }
  return items;
}

function zones(state: WorldState<PatioData>): Zone[] {
  const out: Zone[] = [];
  DOCK_X.forEach((x, i) => {
    const occupied = (state.data.docks[i]?.truckId ?? 0) > 0;
    out.push({
      id: `dock-${i}`,
      label: `D${i + 1}${occupied ? " · ocupada" : " · libre"}`,
      kind: "dock",
      points: [
        { x: (x - DOCK_W / 2) * PX_PER_M, y: BUILDING.y1 * PX_PER_M },
        { x: (x + DOCK_W / 2) * PX_PER_M, y: BUILDING.y1 * PX_PER_M },
        { x: (x + DOCK_W / 2) * PX_PER_M, y: (BUILDING.y1 + 1.2) * PX_PER_M },
        { x: (x - DOCK_W / 2) * PX_PER_M, y: (BUILDING.y1 + 1.2) * PX_PER_M },
      ],
    });
  });
  out.push({ id: "crossing", label: "Zona peatonal", kind: "pedestrian", points: CROSSING_POLY.map((p) => ({ x: p.x * PX_PER_M, y: p.y * PX_PER_M })) });
  out.push({
    id: "walkway",
    label: "Senda peatonal",
    kind: "lane",
    points: [
      { x: OFFICE.x1 * PX_PER_M, y: WALKWAY.y0 * PX_PER_M },
      { x: GATEHOUSE.x0 * PX_PER_M, y: WALKWAY.y0 * PX_PER_M },
      { x: GATEHOUSE.x0 * PX_PER_M, y: WALKWAY.y1 * PX_PER_M },
      { x: OFFICE.x1 * PX_PER_M, y: WALKWAY.y1 * PX_PER_M },
    ],
  });
  return out;
}

export function dockOccupancy(state: WorldState<PatioData>): number {
  return state.data.docks.filter((d) => d.truckId > 0).length;
}

function kpis(state: WorldState<PatioData>): Kpi[] {
  const d = state.data;
  const trucks = state.entities.filter((e) => e.kind === "camion").length;
  const forklifts = state.entities.filter((e) => e.kind === "montacarga" && (e.speed > 0.2 || e.route.length > 0)).length;
  const occ = dockOccupancy(state);
  return [
    { id: "docks", label: "Dársenas ocupadas", value: occ, unit: `/ ${DOCK_COUNT}`, decimals: 0, status: occ >= DOCK_COUNT ? "warn" : "ok" },
    { id: "trucks", label: "Camiones en patio", value: trucks, decimals: 0 },
    { id: "forklifts", label: "Montacargas activos", value: forklifts, decimals: 0 },
    { id: "risks", label: "Riesgos de cruce · turno", value: d.crossingRisks, decimals: 0, status: d.crossingRisks > 5 ? "alert" : d.crossingRisks > 3 ? "warn" : "ok" },
    { id: "dockTime", label: "Tiempo medio en dársena", value: d.dockVisits > 0 ? d.dockMinutesTotal / d.dockVisits : 0, unit: "min", decimals: 0 },
  ];
}

export const patioDef: ModuleDef<PatioData> = {
  id: "patio",
  site: "terminal-sur",
  init,
  step,
  observe,
  zones,
  kpis,
};

export function clampYard(v: number, max: number): number {
  return clamp(v, 0, max);
}
