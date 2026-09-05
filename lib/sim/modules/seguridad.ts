import { OPERATORS } from "@/lib/data/company";
import { clamp, pointInPoly, type Camera } from "../camera";
import type { Entity, Kpi, Observable, PersonEntity, Vec2, Waypoint, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";
import { floorPoly, makePerson, occlusionOf, personView, projectTrail, stepPerson } from "./shared";

export const SEGURIDAD_CAM: Camera = { height: 3.3, pitch: 0.44, focal: 900, cx: 640, cy: 614 };

/** Machine block (the press) in floor metres. */
export const PRESS = { x0: 1.5, x1: 4.4, z0: 7.6, z1: 10.6, h: 2.3 };
export const RESTRICTED: Vec2[] = [
  { x: 0.9, y: 6.4 },
  { x: 5.0, y: 6.4 },
  { x: 5.0, y: 11.6 },
  { x: 0.9, y: 11.6 },
];
export const WALKWAY = { x0: -0.9, x1: 0.7, z0: 3.2, z1: 15.5 };

const NODES = {
  doorL: { x: -7.9, y: 12.4 },
  doorR: { x: 6.6, y: 13.6 },
  exitNear: { x: 0.1, y: 2.4 },
  back: { x: -0.6, y: 16.8 },
  w1: { x: -3.9, y: 11.6, dwell: 11 },
  w2: { x: -3.4, y: 7.2, dwell: 8 },
  w3: { x: -1.6, y: 14.2, dwell: 6 },
  pressFront: { x: 3.2, y: 5.2, dwell: 6 },
  mid: { x: -0.1, y: 8.6 },
  rack: { x: -5.4, y: 8.6, dwell: 5 },
  inside: { x: 3.1, y: 9.1, dwell: 6 },
  gate: { x: 6.0, y: 12.2 },
} satisfies Record<string, Waypoint>;

const SPINE_X = -0.1;

/**
 * People move along the marked walkway (the "spine") and step off it sideways
 * to reach a workstation, so nobody wanders through the restricted zone.
 */
function viaSpine(from: Vec2, to: Waypoint, lane = 0): Waypoint[] {
  const out: Waypoint[] = [];
  const spine = SPINE_X + lane;
  const offSpineFrom = Math.abs(from.x - spine) > 0.6;
  const offSpineTo = Math.abs(to.x - spine) > 0.6;
  const sameSide = (from.x - SPINE_X) * (to.x - SPINE_X) > 0;
  const shortHop = Math.abs(from.y - to.y) < 2.4 && Math.abs(from.x - to.x) < 2.8;
  // Two stops on the same side of the aisle, close together, are walked
  // directly; only cross-floor moves go out to the walkway.
  if (!(sameSide || shortHop)) {
    if (offSpineFrom && Math.abs(from.y - to.y) > 0.8) out.push({ x: spine, y: from.y });
    if (offSpineTo && Math.abs(from.y - to.y) > 0.8) out.push({ x: spine, y: to.y });
  }
  out.push(to);
  return out;
}

/** `lane` keeps each person on their own line of the walkway instead of a queue. */
function routeThrough(start: Vec2, stops: Waypoint[], lane = 0): Waypoint[] {
  const out: Waypoint[] = [];
  let cur: Vec2 = start;
  for (const s of stops) {
    for (const w of viaSpine(cur, s, lane)) out.push(w);
    cur = s;
  }
  return out;
}

export interface SeguridadData {
  personSeconds: number;
  compliantSeconds: number;
  incidents: number;
  restrictedEntries: number;
  spawnCooldown: number;
  lastIncidentT: number;
}

const PLANT_STAFF = OPERATORS.slice(0, 7);

function usedNames(state: WorldState<SeguridadData>): Set<string> {
  const s = new Set<string>();
  for (const e of state.entities) if (e.kind === "persona") s.add(e.name);
  return s;
}

function pickName(ctx: InitCtx | StepCtx, used: Set<string>, prefer?: string) {
  if (prefer) {
    const p = PLANT_STAFF.find((o) => o.name === prefer);
    if (p && !used.has(p.name)) return p;
  }
  const free = PLANT_STAFF.filter((o) => !used.has(o.name));
  if (free.length === 0) return ctx.rng.pick(PLANT_STAFF);
  return ctx.rng.pick(free);
}

function randomRoute(ctx: InitCtx | StepCtx): { start: Vec2; route: Waypoint[] } {
  const entries = [NODES.doorL, NODES.doorR, NODES.exitNear, NODES.back];
  const work = [NODES.w1, NODES.w2, NODES.w3, NODES.pressFront, NODES.rack];
  const start = ctx.rng.pick(entries);
  const n = ctx.rng.int(1, 3);
  const stops = ctx.rng.shuffle(work).slice(0, n);
  const exit = ctx.rng.pick(entries.filter((e) => e !== start));
  const jittered: Waypoint[] = stops.map((s) => ({ x: s.x + ctx.rng.float(-0.35, 0.35), y: s.y + ctx.rng.float(-0.35, 0.35), dwell: s.dwell }));
  jittered.push(exit);
  return { start, route: routeThrough(start, jittered, ctx.rng.float(-0.42, 0.42)) };
}

function spawn(
  ctx: InitCtx | StepCtx,
  state: WorldState<SeguridadData> | null,
  t: number,
  opts: { name?: string; helmet?: boolean; vest?: boolean; start?: Vec2; route?: Waypoint[] } = {},
): PersonEntity {
  const used = state ? usedNames(state) : new Set<string>();
  const who = pickName(ctx, used, opts.name);
  const rr = opts.route ? { start: opts.start ?? NODES.doorL, route: opts.route } : randomRoute(ctx);
  const startJit = { x: rr.start.x + ctx.rng.float(-0.2, 0.2), y: rr.start.y + ctx.rng.float(-0.2, 0.2) };
  return makePerson({
    id: ctx.id(),
    trackId: ctx.track(),
    born: t,
    pos: startJit,
    route: rr.route,
    name: who.name,
    role: who.role,
    helmet: opts.helmet ?? true,
    vest: opts.vest ?? !ctx.rng.chance(0.06),
    height: ctx.rng.float(1.62, 1.86),
    speed: ctx.rng.float(1.0, 1.35),
    shirt: ctx.rng.next(),
  });
}

function init(ctx: InitCtx): { data: SeguridadData; entities: Entity[] } {
  const entities: Entity[] = [];
  // three people mid-task at t=0
  const presets: Array<{ start: Vec2; route: Waypoint[] }> = [
    { start: { x: -3.7, y: 11.3 }, route: routeThrough({ x: -3.7, y: 11.3 }, [{ ...NODES.w1, dwell: 9 }, NODES.exitNear], -0.4) },
    { start: { x: 3.0, y: 5.1 }, route: routeThrough({ x: 3.0, y: 5.1 }, [{ ...NODES.pressFront, dwell: 7 }, { ...NODES.w3, dwell: 8 }, NODES.back], 0.4) },
    { start: { x: -5.2, y: 8.4 }, route: routeThrough({ x: -5.2, y: 8.4 }, [{ ...NODES.rack, dwell: 4 }, { ...NODES.w2, dwell: 10 }, NODES.doorL], 0) },
  ];
  const used = new Set<string>();
  for (const p of presets) {
    const who = pickName(ctx, used);
    used.add(who.name);
    const person = makePerson({
      id: ctx.id(),
      trackId: ctx.track(),
      born: -20,
      pos: p.start,
      route: p.route,
      name: who.name,
      role: who.role,
      helmet: true,
      vest: true,
      height: ctx.rng.float(1.62, 1.86),
      speed: ctx.rng.float(1.0, 1.3),
      shirt: ctx.rng.next(),
    });
    person.dwell = ctx.rng.float(2, 6);
    entities.push(person);
  }
  return {
    data: {
      personSeconds: 2900,
      compliantSeconds: 2831,
      incidents: 3,
      restrictedEntries: 1,
      spawnCooldown: 6,
      lastIncidentT: -412,
    },
    entities,
  };
}

function step(state: WorldState<SeguridadData>, ctx: StepCtx): void {
  const d = state.data;
  const people: PersonEntity[] = [];
  for (const e of state.entities) if (e.kind === "persona") people.push(e);

  for (const action of ctx.actions) {
    if (action === "no-helmet") {
      state.entities.push(
        spawn(ctx, state, ctx.t, {
          name: "M. Ledesma",
          helmet: false,
          vest: true,
          start: NODES.doorL,
          route: routeThrough(NODES.doorL, [{ ...NODES.w1, dwell: 5 }, { ...NODES.pressFront, dwell: 4 }, NODES.exitNear], -0.35),
        }),
      );
    } else if (action === "restricted-entry") {
      state.entities.push(
        spawn(ctx, state, ctx.t, {
          name: "R. Acuña",
          start: NODES.doorR,
          route: [NODES.gate, { x: 4.4, y: 10.9 }, { ...NODES.inside, dwell: 7 }, { x: 4.4, y: 10.9 }, NODES.gate, ...viaSpine(NODES.gate, NODES.exitNear)],
        }),
      );
    } else if (action === "no-vest") {
      state.entities.push(
        spawn(ctx, state, ctx.t, {
          name: "D. Quiroga",
          vest: false,
          start: NODES.doorR,
          route: routeThrough(NODES.doorR, [{ ...NODES.w3, dwell: 6 }, NODES.back], 0.38),
        }),
      );
    }
  }

  // keep the floor populated
  d.spawnCooldown -= ctx.dt;
  if (people.length < 4 && d.spawnCooldown <= 0) {
    state.entities.push(spawn(ctx, state, ctx.t));
    d.spawnCooldown = ctx.rng.float(5, 14);
  }

  const gone: number[] = [];
  for (const p of people) {
    const r = stepPerson(p, ctx.dt, people, ctx.rng);
    if (r === "done") {
      gone.push(p.id);
      continue;
    }
    d.personSeconds += ctx.dt;
    if (p.helmet && p.vest) d.compliantSeconds += ctx.dt;

    // PPE alerts land shortly after the person is first seen
    if (!p.flagged && ctx.t - p.born > 0.9) {
      p.flagged = true;
      if (!p.helmet) {
        d.incidents += 1;
        d.lastIncidentT = ctx.t;
        ctx.emit({ severity: "high", kind: "ppe", title: `EPP faltante · casco · ${p.name}`, detail: `${p.role} · ingreso por puerta oeste · Nave 2`, entityId: p.id });
      } else if (!p.vest) {
        d.incidents += 1;
        d.lastIncidentT = ctx.t;
        ctx.emit({ severity: "medium", kind: "ppe", title: `EPP faltante · chaleco · ${p.name}`, detail: `${p.role} · Nave 2`, entityId: p.id });
      }
    }

    const inside = pointInPoly(p.pos, RESTRICTED);
    if (inside && !p.restricted) {
      p.restricted = true;
      p.restrictedSince = ctx.t;
      p.zone = "Prensas";
      d.restrictedEntries += 1;
      d.incidents += 1;
      d.lastIncidentT = ctx.t;
      ctx.emit({ severity: "high", kind: "zone", title: `Ingreso a zona restringida · ${p.name}`, detail: `Prensas · ${p.role} · sin autorización registrada`, entityId: p.id });
    } else if (!inside && p.restricted) {
      p.restricted = false;
      p.zone = null;
      const secs = Math.round(ctx.t - p.restrictedSince);
      ctx.emit({ severity: "info", kind: "zone", title: `Salida de zona restringida · ${p.name}`, detail: `Permanencia ${secs} s`, entityId: p.id });
    }
  }
  if (gone.length) state.entities = state.entities.filter((e) => !gone.includes(e.id));
}

function observe(state: WorldState<SeguridadData>): Observable[] {
  const cam = SEGURIDAD_CAM;
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind !== "persona") continue;
    if (e.pos.y < 2.2) continue;
    const v = personView(cam, e);
    items.push({
      entityId: e.id,
      trackId: e.trackId,
      kind: "persona",
      box: v.box,
      depth: clamp((e.pos.y - 2) / 15, 0, 1),
      occlusion: 0,
      pose: v.pose,
      head: v.head,
      torso: v.torso,
      trail: projectTrail(cam, e.trail),
      attrs: { helmet: e.helmet, vest: e.vest, name: e.name, role: e.role, restricted: e.restricted, zone: e.zone },
    });
  }
  const occ = occlusionOf(items);
  items.forEach((it, i) => {
    it.occlusion = occ[i] ?? 0;
  });
  return items;
}

function zones(): Zone[] {
  return [
    { id: "restricted", label: "Zona restringida · Prensas", kind: "restricted", floor: RESTRICTED, points: floorPoly(SEGURIDAD_CAM, RESTRICTED) },
    {
      id: "walkway",
      label: "Senda peatonal",
      kind: "lane",
      floor: [
        { x: WALKWAY.x0, y: WALKWAY.z0 },
        { x: WALKWAY.x1, y: WALKWAY.z0 },
        { x: WALKWAY.x1, y: WALKWAY.z1 },
        { x: WALKWAY.x0, y: WALKWAY.z1 },
      ],
      points: floorPoly(SEGURIDAD_CAM, [
        { x: WALKWAY.x0, y: WALKWAY.z0 },
        { x: WALKWAY.x1, y: WALKWAY.z0 },
        { x: WALKWAY.x1, y: WALKWAY.z1 },
        { x: WALKWAY.x0, y: WALKWAY.z1 },
      ]),
    },
  ];
}

export function ppeCompliance(state: WorldState<SeguridadData>): number {
  const d = state.data;
  return d.personSeconds > 0 ? (d.compliantSeconds / d.personSeconds) * 100 : 100;
}

function kpis(state: WorldState<SeguridadData>): Kpi[] {
  const d = state.data;
  const people = state.entities.filter((e) => e.kind === "persona").length;
  const compliance = ppeCompliance(state);
  return [
    { id: "ppe", label: "Cumplimiento EPP", value: compliance, unit: "%", decimals: 1, status: compliance < 95 ? "warn" : "ok" },
    { id: "incidents", label: "Incidentes · turno", value: d.incidents, decimals: 0, status: d.incidents > 5 ? "warn" : "ok" },
    { id: "restricted", label: "Ingresos zona restringida", value: d.restrictedEntries, decimals: 0, status: d.restrictedEntries > 1 ? "alert" : "ok" },
    { id: "people", label: "Personas en escena", value: people, decimals: 0 },
  ];
}

export const seguridadDef: ModuleDef<SeguridadData> = {
  id: "seguridad",
  site: "planta-rosario",
  init,
  step,
  observe,
  zones,
  kpis,
};
