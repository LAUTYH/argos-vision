import { angleLerp, boxIntersection, dist, project, projectBox, type Camera } from "../camera";
import type { Rng } from "../rng";
import type { Box, PersonEntity, Vec2, Waypoint } from "../types";

/** Per-object fraction of its box hidden by nearer objects (depth ascending = nearer). */
export function occlusionOf(items: Array<{ box: Box; depth: number }>): number[] {
  const out = items.map(() => 0);
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a) continue;
    const area = a.box.w * a.box.h;
    if (area <= 0) continue;
    let covered = 0;
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const b = items[j];
      if (!b || b.depth >= a.depth) continue;
      covered += boxIntersection(a.box, b.box);
    }
    out[i] = Math.min(0.95, covered / area);
  }
  return out;
}

export interface PersonSeed {
  id: number;
  trackId: number;
  born: number;
  pos: Vec2;
  route: Waypoint[];
  name: string;
  role: string;
  helmet: boolean;
  vest: boolean;
  height: number;
  speed: number;
  shirt: number;
  loop?: boolean;
}

export function makePerson(s: PersonSeed): PersonEntity {
  const first = s.route[0] ?? s.pos;
  return {
    kind: "persona",
    id: s.id,
    trackId: s.trackId,
    born: s.born,
    pos: { x: s.pos.x, y: s.pos.y },
    heading: Math.atan2(first.y - s.pos.y, first.x - s.pos.x),
    speed: 0,
    targetSpeed: s.speed,
    gait: 0,
    height: s.height,
    helmet: s.helmet,
    vest: s.vest,
    name: s.name,
    role: s.role,
    route: s.route,
    wp: 0,
    dwell: 0,
    loop: s.loop ?? false,
    zone: null,
    zoneSince: 0,
    restricted: false,
    restrictedSince: 0,
    flagged: false,
    shirt: s.shirt,
    trail: [],
    trailAcc: 0,
  };
}

export type WalkResult = "walking" | "dwelling" | "done";

/**
 * Waypoint follower with smooth heading, acceleration and gait phase. Adds a
 * little separation from neighbours so people never overlap exactly.
 */
export function stepPerson(p: PersonEntity, dt: number, others: PersonEntity[], rng: Rng, trailEvery = 0.25): WalkResult {
  // Trail sampling. Standing still consumes the trail rather than piling
  // points on one spot.
  p.trailAcc += dt;
  if (p.trailAcc >= trailEvery) {
    p.trailAcc -= trailEvery;
    if (p.speed > 0.2) {
      p.trail.push({ x: p.pos.x, y: p.pos.y });
      if (p.trail.length > 36) p.trail.shift();
    } else if (p.trail.length > 0) {
      p.trail.shift();
    }
  }

  if (p.dwell > 0) {
    p.dwell -= dt;
    p.speed = Math.max(0, p.speed - dt * 3);
    // idle sway keeps the skeleton alive
    p.gait += dt * 0.6;
    if (p.speed > 0.01) p.pos = advance(p.pos, p.heading, p.speed * dt);
    return "dwelling";
  }
  const target = p.route[p.wp];
  if (!target) {
    if (p.loop && p.route.length > 0) {
      p.wp = 0;
      return "walking";
    }
    return "done";
  }
  const d = dist(p.pos, target);
  if (d < 0.18) {
    p.wp += 1;
    if (target.dwell && target.dwell > 0) p.dwell = target.dwell * rng.float(0.85, 1.15);
    return "walking";
  }
  const desired = Math.atan2(target.y - p.pos.y, target.x - p.pos.x);
  p.heading = angleLerp(p.heading, desired, 1 - Math.exp(-dt * 5));
  const slow = d < 0.8 ? Math.max(0.35, d / 0.8) : 1;
  const goal = p.targetSpeed * slow;
  p.speed += (goal - p.speed) * (1 - Math.exp(-dt * 4));
  let step = advance(p.pos, p.heading, p.speed * dt);
  // separation
  for (const o of others) {
    if (o.id === p.id) continue;
    const dd = dist(step, o.pos);
    if (dd < 0.75 && dd > 1e-3) {
      const push = ((0.75 - dd) / 0.75) * 0.9 * dt;
      step = { x: step.x + ((step.x - o.pos.x) / dd) * push, y: step.y + ((step.y - o.pos.y) / dd) * push };
    }
  }
  p.pos = step;
  p.gait += (p.speed * dt) / 0.72 * Math.PI * 2;
  return "walking";
}

function advance(pos: Vec2, heading: number, len: number): Vec2 {
  return { x: pos.x + Math.cos(heading) * len, y: pos.y + Math.sin(heading) * len };
}

/** COCO-17 keypoints projected to the screen, plus the head, torso and full boxes. */
export interface PersonView {
  box: Box;
  head: Box;
  torso: Box;
  pose: Vec2[];
  depthZ: number;
}

export function personView(cam: Camera, p: PersonEntity): PersonView {
  const H = p.height;
  const fx = Math.cos(p.heading);
  const fz = Math.sin(p.heading);
  const lx = -fz;
  const lz = fx;
  const swingAmp = Math.min(1, p.speed / 0.9);
  const legSwing = Math.sin(p.gait) * 0.26 * swingAmp;
  const armSwing = -Math.sin(p.gait) * 0.18 * swingAmp;
  const kneeLift = Math.max(0, Math.sin(p.gait)) * 0.12 * swingAmp;
  const kneeLiftR = Math.max(0, -Math.sin(p.gait)) * 0.12 * swingAmp;
  const bob = Math.abs(Math.sin(p.gait)) * 0.025 * swingAmp;
  const idle = Math.sin(p.gait * 0.7) * 0.01;

  const pt = (side: number, fwd: number, h: number): Vec2 =>
    project(cam, p.pos.x + lx * side + fx * fwd, h + bob + idle, p.pos.y + lz * side + fz * fwd);

  const kp: Vec2[] = [
    pt(0, 0.05, H * 0.94), // nose
    pt(0.03, 0.04, H * 0.955), // l eye
    pt(-0.03, 0.04, H * 0.955), // r eye
    pt(0.075, 0, H * 0.94), // l ear
    pt(-0.075, 0, H * 0.94), // r ear
    pt(0.19, 0, H * 0.82), // l shoulder
    pt(-0.19, 0, H * 0.82), // r shoulder
    pt(0.22, armSwing * 0.6, H * 0.64), // l elbow
    pt(-0.22, -armSwing * 0.6, H * 0.64), // r elbow
    pt(0.21, armSwing, H * 0.47), // l wrist
    pt(-0.21, -armSwing, H * 0.47), // r wrist
    pt(0.12, 0, H * 0.53), // l hip
    pt(-0.12, 0, H * 0.53), // r hip
    pt(0.12, legSwing * 0.55, H * 0.29 + kneeLift), // l knee
    pt(-0.12, -legSwing * 0.55, H * 0.29 + kneeLiftR), // r knee
    pt(0.12, legSwing, 0.04 + kneeLift * 0.6), // l ankle
    pt(-0.12, -legSwing, 0.04 + kneeLiftR * 0.6), // r ankle
  ];
  const box = projectBox(cam, p.pos.x, 0, p.pos.y, 0.52, H + 0.04 + bob, 0.34, p.heading);
  const head = projectBox(cam, p.pos.x + fx * 0.02, H * 0.86 + bob, p.pos.y + fz * 0.02, 0.24, H * 0.16 + 0.03, 0.24, p.heading);
  const torso = projectBox(cam, p.pos.x, H * 0.5 + bob, p.pos.y, 0.46, H * 0.36, 0.3, p.heading);
  return { box, head, torso, pose: kp, depthZ: p.pos.y };
}

export function floorPoly(cam: Camera, pts: Vec2[]): Vec2[] {
  return pts.map((q) => project(cam, q.x, 0, q.y));
}

/** Screen-space trail from floor positions. */
export function projectTrail(cam: Camera, trail: Vec2[]): Vec2[] {
  return trail.map((q) => project(cam, q.x, 0, q.y));
}

export function pickDistinct<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  return rng.shuffle(arr).slice(0, n);
}
