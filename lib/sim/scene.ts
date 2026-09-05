import { hashRng, valueNoise2 } from "./rng";
import { project, SCENE_H, SCENE_W, type Camera } from "./camera";
import type { ModuleId, Vec2 } from "./types";
import { blitLayer, FONTS, getNoiseTile, hexAlpha, polyPath, roundRect, staticLayer } from "@/lib/render/canvas";
import { BELT, BELT_LEN, beltPoint, RECEPCION_CAM } from "./modules/recepcion";
import { PRESS, RESTRICTED, SEGURIDAD_CAM, WALKWAY as SEG_WALKWAY } from "./modules/seguridad";
import { COUNT_LINE, FLOW_ZONES, FLUJO_CAM } from "./modules/flujo";
import {
  BUILDING,
  CROSSING,
  DOCK_W,
  DOCK_X,
  GATEHOUSE,
  LANE_N,
  LANE_S,
  OFFICE,
  PALLET_BLOCKS,
  PX_PER_M,
  STAGING,
  TRUCK_LANE,
  WALKWAY as YARD_WALKWAY,
  YARD,
} from "./modules/patio";
import { BLADE_CY, BLADE_LENGTH_M, cameraU, halfChordPx, PX_PER_M as BLADE_PX_M } from "./modules/inspeccion";
import { DOC, layoutRemito } from "./modules/documentos";
import { REMITOS } from "@/lib/data/company";

/**
 * Procedural backgrounds. Nothing here is loaded: floors, racks, machines,
 * the yard and the document are all drawn from geometry. Static parts are
 * cached per module; the moving parts (belt, drone camera) are painted per frame.
 */

export interface SceneInput {
  module: ModuleId;
  t: number;
  seed: number;
  /** Module-specific scroll value (drone position, active document). */
  param: number;
  dpr: number;
}

// ── helpers ────────────────────────────────────────────────────────────────

function floorQuad(ctx: CanvasRenderingContext2D, cam: Camera, x0: number, z0: number, x1: number, z1: number, y = 0): void {
  polyPath(ctx, [project(cam, x0, y, z0), project(cam, x1, y, z0), project(cam, x1, y, z1), project(cam, x0, y, z1)]);
}

function box3(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, w: number, h: number, d: number, top: string, front: string, side: string): void {
  const c = [
    project(cam, x - w / 2, 0, z - d / 2),
    project(cam, x + w / 2, 0, z - d / 2),
    project(cam, x + w / 2, 0, z + d / 2),
    project(cam, x - w / 2, 0, z + d / 2),
    project(cam, x - w / 2, h, z - d / 2),
    project(cam, x + w / 2, h, z - d / 2),
    project(cam, x + w / 2, h, z + d / 2),
    project(cam, x - w / 2, h, z + d / 2),
  ] as [Vec2, Vec2, Vec2, Vec2, Vec2, Vec2, Vec2, Vec2];
  ctx.fillStyle = top;
  polyPath(ctx, [c[4], c[5], c[6], c[7]]);
  ctx.fill();
  ctx.fillStyle = front;
  polyPath(ctx, [c[0], c[1], c[5], c[4]]);
  ctx.fill();
  const leftVisible = x > 0;
  ctx.fillStyle = side;
  if (leftVisible) polyPath(ctx, [c[0], c[3], c[7], c[4]]);
  else polyPath(ctx, [c[1], c[2], c[6], c[5]]);
  ctx.fill();
}

function lightPool(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, rx: number, rz: number, alpha: number, warm = true): void {
  const c = project(cam, x, 0, z);
  const a = project(cam, x + rx, 0, z);
  const b = project(cam, x, 0, z + rz);
  const rX = Math.abs(a.x - c.x);
  const rY = Math.max(4, Math.abs(b.y - c.y));
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rX);
  g.addColorStop(0, warm ? `rgba(255,238,205,${alpha})` : `rgba(210,225,255,${alpha})`);
  g.addColorStop(1, "rgba(255,238,205,0)");
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, rY / rX);
  ctx.translate(-c.x, -c.y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, rX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, strength = 0.42): void {
  const g = ctx.createRadialGradient(SCENE_W / 2, SCENE_H / 2, SCENE_H * 0.35, SCENE_W / 2, SCENE_H / 2, SCENE_W * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}

function rackRun(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z0: number, z1: number, bays: number, levels: number, seed: number, depth = 1.1): void {
  const r = hashRng(seed, "rack", x);
  const bayLen = (z1 - z0) / bays;
  const levelH = 1.5;
  // stored loads
  for (let b = 0; b < bays; b++) {
    for (let l = 0; l < levels; l++) {
      if (r.chance(0.18)) continue;
      const tone = r.float(0.3, 0.6);
      const hue = r.chance(0.7) ? 30 : r.chance(0.5) ? 210 : 0;
      const sat = hue === 30 ? 28 : 18;
      const zc = z0 + (b + 0.5) * bayLen;
      const y = l * levelH + 0.12;
      const h = levelH * r.float(0.55, 0.8);
      const cc = [
        project(cam, x - depth / 2, y, zc - bayLen * 0.42),
        project(cam, x + depth / 2, y, zc - bayLen * 0.42),
        project(cam, x + depth / 2, y, zc + bayLen * 0.42),
        project(cam, x - depth / 2, y, zc + bayLen * 0.42),
        project(cam, x - depth / 2, y + h, zc - bayLen * 0.42),
        project(cam, x + depth / 2, y + h, zc - bayLen * 0.42),
        project(cam, x + depth / 2, y + h, zc + bayLen * 0.42),
        project(cam, x - depth / 2, y + h, zc + bayLen * 0.42),
      ] as Vec2[];
      const L = 22 + tone * 22;
      ctx.fillStyle = `hsl(${hue} ${sat}% ${L}%)`;
      polyPath(ctx, [cc[0] as Vec2, cc[1] as Vec2, cc[5] as Vec2, cc[4] as Vec2]);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} ${sat}% ${L - 7}%)`;
      const inner = x < 0 ? [cc[1], cc[2], cc[6], cc[5]] : [cc[0], cc[3], cc[7], cc[4]];
      polyPath(ctx, inner as Vec2[]);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} ${sat}% ${L + 6}%)`;
      polyPath(ctx, [cc[4] as Vec2, cc[5] as Vec2, cc[6] as Vec2, cc[7] as Vec2]);
      ctx.fill();
    }
  }
  // uprights and beams
  ctx.strokeStyle = "#5c6470";
  ctx.lineWidth = 1.4;
  for (let b = 0; b <= bays; b++) {
    const z = z0 + b * bayLen;
    const xi = x < 0 ? x + depth / 2 : x - depth / 2;
    const a = project(cam, xi, 0, z);
    const t = project(cam, xi, levels * levelH + 0.2, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#7c6a3a";
  for (let l = 0; l <= levels; l++) {
    const xi = x < 0 ? x + depth / 2 : x - depth / 2;
    const a = project(cam, xi, l * levelH + 0.08, z0);
    const b = project(cam, xi, l * levelH + 0.08, z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function concreteFloor(ctx: CanvasRenderingContext2D, cam: Camera, x0: number, x1: number, z0: number, z1: number, base: string, far: string, joints: number): void {
  const near = project(cam, 0, 0, z0).y;
  const farY = project(cam, 0, 0, z1).y;
  const g = ctx.createLinearGradient(0, near, 0, farY);
  g.addColorStop(0, base);
  g.addColorStop(1, far);
  ctx.fillStyle = g;
  floorQuad(ctx, cam, x0, z0, x1, z1);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  for (let x = x0; x <= x1; x += joints) {
    const a = project(cam, x, 0, z0);
    const b = project(cam, x, 0, z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let z = z0; z <= z1; z += joints) {
    const a = project(cam, x0, 0, z);
    const b = project(cam, x1, 0, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function backWall(ctx: CanvasRenderingContext2D, cam: Camera, z: number, x0: number, x1: number, h: number, color: string, windows: boolean, seed: number): void {
  const a = project(cam, x0, 0, z);
  const b = project(cam, x1, 0, z);
  const c = project(cam, x1, h, z);
  const d = project(cam, x0, h, z);
  ctx.fillStyle = color;
  polyPath(ctx, [a, b, c, d]);
  ctx.fill();
  // sheet-metal ribs
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let x = x0; x <= x1; x += 1.2) {
    const p = project(cam, x, 0, z);
    const q = project(cam, x, h, z);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  if (windows) {
    const r = hashRng(seed, "win");
    for (let x = x0 + 2; x < x1 - 2; x += 4) {
      const p = project(cam, x, h * 0.55, z);
      const q = project(cam, x + 2.4, h * 0.85, z);
      const g = ctx.createLinearGradient(p.x, q.y, p.x, p.y);
      g.addColorStop(0, `rgba(190,210,235,${r.float(0.14, 0.24)})`);
      g.addColorStop(1, "rgba(190,210,235,0.06)");
      ctx.fillStyle = g;
      ctx.fillRect(p.x, q.y, q.x - p.x, p.y - q.y);
    }
  }
}


/**
 * Roof structure: trusses and high-bay fixtures. Everything above camera
 * height lands above the horizon, which is what stops the top of the frame
 * reading as fog.
 */
function ceilingRig(ctx: CanvasRenderingContext2D, cam: Camera, o: { x0: number; x1: number; z0: number; z1: number; h: number; step: number }): void {
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1.2;
  for (let z = o.z0; z <= o.z1; z += o.step) {
    const a = project(cam, o.x0, o.h, z);
    const b = project(cam, o.x1, o.h, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // truss web
    const c = project(cam, o.x0, o.h - 0.45, z);
    const d = project(cam, o.x1, o.h - 0.45, z);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
  // longitudinal purlins
  for (let x = o.x0; x <= o.x1; x += (o.x1 - o.x0) / 6) {
    const a = project(cam, x, o.h, o.z0);
    const b = project(cam, x, o.h, o.z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // High-bay fixtures: a thin emissive bar with a soft halo. Kept small so a
  // near one does not turn into a grey slab.
  for (let z = o.z0 + o.step * 0.5; z <= o.z1; z += o.step) {
    for (const x of [-o.x1 * 0.45, 0, o.x1 * 0.45]) {
      const a = project(cam, x - 0.5, o.h - 0.5, z);
      const b = project(cam, x + 0.5, o.h - 0.5, z);
      const w = Math.max(3, Math.abs(b.x - a.x));
      const hh = Math.max(2, w * 0.11);
      const cxp = (a.x + b.x) / 2;
      const cyp = a.y;
      const halo = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, w * 0.9);
      halo.addColorStop(0, "rgba(255,240,205,0.3)");
      halo.addColorStop(1, "rgba(255,240,205,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cxp - w, cyp - w * 0.5, w * 2, w);
      ctx.fillStyle = "rgba(18,21,26,0.95)";
      ctx.fillRect(a.x, cyp - hh, w, hh * 2);
      ctx.fillStyle = "rgba(255,248,231,0.92)";
      ctx.fillRect(a.x + w * 0.06, cyp - hh * 0.45, w * 0.88, hh * 0.95);
    }
  }
}

/** A rack run parallel to the back wall, filling the band above the floor. */
function backRack(ctx: CanvasRenderingContext2D, cam: Camera, z: number, x0: number, x1: number, bays: number, levels: number, seed: number): void {
  const r = hashRng(seed, "backrack", Math.round(z * 10));
  const bayW = (x1 - x0) / bays;
  const levelH = 1.45;
  for (let b = 0; b < bays; b++) {
    for (let l = 0; l < levels; l++) {
      if (r.chance(0.2)) continue;
      const cx = x0 + (b + 0.5) * bayW;
      const y = l * levelH + 0.1;
      const h = levelH * r.float(0.6, 0.82);
      const hue = r.chance(0.72) ? 31 : r.chance(0.5) ? 210 : 0;
      const sat = hue === 31 ? 30 : 16;
      const L = 20 + r.float(0, 16);
      box3(ctx, cam, cx, z, bayW * 0.86, h, 1.0, `hsl(${hue} ${sat}% ${L + 6}%)`, `hsl(${hue} ${sat}% ${L}%)`, `hsl(${hue} ${sat}% ${L - 5}%)`);
    }
  }
  ctx.strokeStyle = "rgba(120,130,142,0.5)";
  ctx.lineWidth = 1.3;
  for (let b = 0; b <= bays; b++) {
    const x = x0 + b * bayW;
    const a = project(cam, x, 0, z - 0.5);
    const t = project(cam, x, levels * levelH + 0.2, z - 0.5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
}

// ── Recepción ──────────────────────────────────────────────────────────────

function paintRecepcionStatic(ctx: CanvasRenderingContext2D, seed: number): void {
  const cam = RECEPCION_CAM;
  ctx.fillStyle = "#14171c";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  backWall(ctx, cam, 21, -14, 14, 7, "#1b2027", true, seed);
  ceilingRig(ctx, cam, { x0: -13, x1: 13, z0: 5, z1: 20, h: 5.6, step: 3 });
  backRack(ctx, cam, 19.4, -13, 3.4, 7, 3, seed);
  concreteFloor(ctx, cam, -14, 14, 1.5, 21, "#3a3d42", "#25282d", 2);
  // dock door glow on the right
  const g1 = project(cam, 9.6, 0, 7.5);
  const g2 = project(cam, 9.6, 4.2, 13);
  const g = ctx.createLinearGradient(g1.x, g1.y, g2.x, g2.y);
  g.addColorStop(0, "rgba(200,220,245,0.22)");
  g.addColorStop(1, "rgba(200,220,245,0.05)");
  ctx.fillStyle = g;
  polyPath(ctx, [project(cam, 9.6, 0, 7.5), project(cam, 9.6, 0, 13), project(cam, 9.6, 4.2, 13), project(cam, 9.6, 4.2, 7.5)]);
  ctx.fill();
  lightPool(ctx, cam, 9.2, 10, 4.5, 3.5, 0.16, false);
  rackRun(ctx, cam, -9.3, 4, 20, 8, 3, seed);
  lightPool(ctx, cam, -2.5, 6, 3.6, 2.2, 0.13);
  lightPool(ctx, cam, -3.5, 12, 4, 2.6, 0.11);
  lightPool(ctx, cam, 3.5, 9, 3.5, 2.4, 0.1);
  // conveyor frame: legs and rails
  const half = BELT.width / 2;
  const side = (lat: number, y: number): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = beltPoint(i / 12, lat);
      pts.push(project(cam, p.x, y, p.y));
    }
    return pts;
  };
  const railL = side(-half - 0.06, BELT.height + 0.06);
  const railR = side(half + 0.06, BELT.height + 0.06);
  const baseL = side(-half - 0.06, BELT.height - 0.16);
  const baseR = side(half + 0.06, BELT.height - 0.16);
  // shadow under the belt
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  polyPath(ctx, [...side(-half - 0.35, 0), ...side(half + 0.35, 0).reverse()]);
  ctx.fill();
  // legs
  ctx.strokeStyle = "#4a5058";
  ctx.lineWidth = 2.2;
  for (let i = 0; i <= 8; i++) {
    for (const lat of [-half, half]) {
      const p = beltPoint(i / 8, lat);
      const a = project(cam, p.x, 0, p.y);
      const b = project(cam, p.x, BELT.height - 0.16, p.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // side panels
  ctx.fillStyle = "#3b414a";
  polyPath(ctx, [...baseL, ...railL.slice().reverse()]);
  ctx.fill();
  ctx.fillStyle = "#454c56";
  polyPath(ctx, [...baseR, ...railR.slice().reverse()]);
  ctx.fill();
  // belt surface base (rollers painted dynamically)
  ctx.fillStyle = "#1e2024";
  polyPath(ctx, [...side(-half, BELT.height), ...side(half, BELT.height).reverse()]);
  ctx.fill();
  ctx.strokeStyle = "#6a727c";
  ctx.lineWidth = 1.5;
  for (const rail of [railL, railR]) {
    ctx.beginPath();
    rail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  // scanner arch near the exit
  const arch = beltPoint(0.9, 0);
  box3(ctx, cam, arch.x, arch.y, 1.6, 1.9, 0.25, "#2c3138", "#252a31", "#1f242a");
  // floor markings along the near side
  ctx.strokeStyle = "rgba(235,190,60,0.55)";
  ctx.lineWidth = 3;
  const m0 = project(cam, -8, 0.005, 3.2);
  const m1 = project(cam, 8, 0.005, 3.2);
  ctx.beginPath();
  ctx.moveTo(m0.x, m0.y);
  ctx.lineTo(m1.x, m1.y);
  ctx.stroke();
  vignette(ctx);
}

function paintRecepcionDynamic(ctx: CanvasRenderingContext2D, t: number): void {
  const cam = RECEPCION_CAM;
  const half = BELT.width / 2;
  // moving roller/slat lines on the belt surface
  const spacing = 0.28;
  const offset = ((t * BELT.speed) % spacing) / BELT_LEN;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let s = -offset; s < 1; s += spacing / BELT_LEN) {
    if (s < 0) continue;
    const a = beltPoint(s, -half);
    const b = beltPoint(s, half);
    const pa = project(cam, a.x, BELT.height, a.y);
    const pb = project(cam, b.x, BELT.height, b.y);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
}

// ── Seguridad ──────────────────────────────────────────────────────────────

function paintSeguridadStatic(ctx: CanvasRenderingContext2D, seed: number): void {
  const cam = SEGURIDAD_CAM;
  ctx.fillStyle = "#121519";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  backWall(ctx, cam, 19, -16, 16, 6.5, "#1d2229", true, seed);
  ceilingRig(ctx, cam, { x0: -14, x1: 14, z0: 5, z1: 18, h: 5.4, step: 3 });
  backRack(ctx, cam, 17.6, -13, -1.4, 5, 3, seed);
  concreteFloor(ctx, cam, -16, 16, 1.6, 19, "#353a3d", "#22262a", 2.5);
  // painted walkway
  ctx.fillStyle = "rgba(120,150,110,0.16)";
  floorQuad(ctx, cam, SEG_WALKWAY.x0, SEG_WALKWAY.z0, SEG_WALKWAY.x1, SEG_WALKWAY.z1, 0.004);
  ctx.fill();
  ctx.strokeStyle = "rgba(235,190,60,0.7)";
  ctx.lineWidth = 2.5;
  for (const x of [SEG_WALKWAY.x0, SEG_WALKWAY.x1]) {
    const a = project(cam, x, 0.005, SEG_WALKWAY.z0);
    const b = project(cam, x, 0.005, SEG_WALKWAY.z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // restricted zone floor: hatched yellow/black border painted on the floor
  // Floor paint inside the restricted zone: a hatched border, painted on the
  // slab, plus a faint tint. Derived from the polygon so it stays put if the
  // zone moves.
  const rx0 = Math.min(...RESTRICTED.map((p) => p.x));
  const rx1 = Math.max(...RESTRICTED.map((p) => p.x));
  const rz0 = Math.min(...RESTRICTED.map((p) => p.y));
  const rz1 = Math.max(...RESTRICTED.map((p) => p.y));
  ctx.save();
  polyPath(ctx, RESTRICTED.map((p) => project(cam, p.x, 0.004, p.y)));
  ctx.fillStyle = "rgba(190,70,55,0.06)";
  ctx.fill();
  ctx.clip();
  ctx.lineWidth = 5;
  const span = rz1 - rz0 + (rx1 - rx0);
  for (let i = 0; i * 0.5 < span; i++) {
    const off = rz0 - (rx1 - rx0) + i * 0.5;
    const a = project(cam, rx0, 0.005, off);
    const b = project(cam, rx1, 0.005, off + (rx1 - rx0));
    ctx.strokeStyle = i % 2 ? "rgba(214,176,58,0.22)" : "rgba(18,18,18,0.24)";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(230,190,50,0.55)";
  ctx.lineWidth = 2;
  polyPath(ctx, RESTRICTED.map((p) => project(cam, p.x, 0.006, p.y)));
  ctx.stroke();
  rackRun(ctx, cam, -9.6, 5, 17, 6, 2, seed, 1.2);
  // the press
  const px = (PRESS.x0 + PRESS.x1) / 2;
  const pz = (PRESS.z0 + PRESS.z1) / 2;
  box3(ctx, cam, px, pz, PRESS.x1 - PRESS.x0, PRESS.h, PRESS.z1 - PRESS.z0, "#4d5768", "#39424f", "#2e3540");
  box3(ctx, cam, px - 0.9, pz - 0.2, 1.2, PRESS.h + 1.2, 1.0, "#5b688a", "#424b60", "#353c4c");
  // hydraulic columns and a yellow safety stripe along the base
  for (const ox of [-1.3, 1.3]) box3(ctx, cam, px + ox, pz + 1.1, 0.34, PRESS.h + 0.9, 0.34, "#6a7488", "#4a5262", "#3b4250");
  box3(ctx, cam, px, pz - (PRESS.z1 - PRESS.z0) / 2 + 0.08, PRESS.x1 - PRESS.x0, 0.22, 0.16, "#c9a83a", "#a98c2c", "#8a7124");
  // control panel and beacon
  const panel = project(cam, px + 1.1, 1.3, PRESS.z0 - 0.02);
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(panel.x - 12, panel.y - 14, 24, 20);
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.arc(project(cam, px - 0.9, PRESS.h + 1.25, pz - 0.2).x, project(cam, px - 0.9, PRESS.h + 1.25, pz - 0.2).y, 3, 0, Math.PI * 2);
  ctx.fill();
  // guard rail along the near edge of the zone
  ctx.strokeStyle = "rgba(176,143,44,0.85)";
  ctx.lineWidth = 2;
  for (let x = rx0; x <= rx1 + 0.01; x += 1.4) {
    const a = project(cam, x, 0, rz0);
    const b = project(cam, x, 1.05, rz0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const h of [1.05, 0.55]) {
    const r0 = project(cam, rx0, h, rz0);
    const r1 = project(cam, rx1, h, rz0);
    ctx.beginPath();
    ctx.moveTo(r0.x, r0.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.stroke();
  }
  // workstations left
  box3(ctx, cam, -3.9, 12.6, 1.8, 0.9, 0.8, "#3d4349", "#31363c", "#2a2f34");
  box3(ctx, cam, -3.4, 6.2, 1.8, 0.9, 0.8, "#3d4349", "#31363c", "#2a2f34");
  box3(ctx, cam, -2.2, 15.2, 1.6, 0.9, 0.8, "#3d4349", "#31363c", "#2a2f34");
  lightPool(ctx, cam, -3, 8, 3.8, 2.4, 0.12);
  lightPool(ctx, cam, 3, 13, 4.2, 2.8, 0.1);
  lightPool(ctx, cam, -1, 15, 3.4, 2.2, 0.08);
  vignette(ctx, 0.46);
}

// ── Flujo ──────────────────────────────────────────────────────────────────

function paintFlujoStatic(ctx: CanvasRenderingContext2D, seed: number): void {
  const cam = FLUJO_CAM;
  ctx.fillStyle = "#121519";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  backWall(ctx, cam, 20, -18, 18, 9, "#1c2128", false, seed);
  ceilingRig(ctx, cam, { x0: -15, x1: 15, z0: 6, z1: 19, h: 6.2, step: 3.2 });
  backRack(ctx, cam, 18.9, -14, 14, 10, 3, seed);
  concreteFloor(ctx, cam, -18, 18, 1.8, 20, "#383b40", "#23262b", 2);
  // picking racks inside the two zones
  for (const z of FLOW_ZONES) {
    if (z.id === "packing") continue;
    const xr = z.id === "pickA" ? z.rect.x0 - 0.2 : z.rect.x1 + 0.2;
    rackRun(ctx, cam, xr, z.rect.z0 - 0.3, z.rect.z1 + 0.3, 5, 3, seed + (z.id === "pickA" ? 1 : 2), 1.1);
    // low shelving inside the zone
    const xs = z.id === "pickA" ? z.rect.x0 + 1.5 : z.rect.x1 - 1.5;
    box3(ctx, cam, xs, (z.rect.z0 + z.rect.z1) / 2, 0.9, 1.4, z.rect.z1 - z.rect.z0 - 1.2, "#40464d", "#33383f", "#2b3036");
  }
  // packing tables at the back
  for (let i = -1; i <= 1; i++) box3(ctx, cam, i * 2.2, 15.2, 1.8, 0.9, 0.9, "#4a5057", "#3a3f46", "#31363c");
  // lane markings
  ctx.strokeStyle = "rgba(235,235,235,0.35)";
  ctx.lineWidth = 2;
  for (const x of [-2.4, 2.4]) {
    const a = project(cam, x, 0.004, 2.2);
    const b = project(cam, x, 0.004, 13);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // zone floor tints (painted)
  for (const z of FLOW_ZONES) {
    ctx.fillStyle = z.id === "packing" ? "rgba(90,130,170,0.09)" : "rgba(150,140,90,0.07)";
    floorQuad(ctx, cam, z.rect.x0, z.rect.z0, z.rect.x1, z.rect.z1, 0.003);
    ctx.fill();
  }
  // entrance line painted on the floor
  ctx.strokeStyle = "rgba(235,190,60,0.5)";
  ctx.lineWidth = 3;
  const l0 = project(cam, COUNT_LINE.x0, 0.005, COUNT_LINE.z);
  const l1 = project(cam, COUNT_LINE.x1, 0.005, COUNT_LINE.z);
  ctx.beginPath();
  ctx.moveTo(l0.x, l0.y);
  ctx.lineTo(l1.x, l1.y);
  ctx.stroke();
  lightPool(ctx, cam, 0, 6, 4.2, 2.6, 0.13);
  lightPool(ctx, cam, 0, 11, 4.4, 2.8, 0.11);
  lightPool(ctx, cam, 0, 16, 4.6, 3, 0.09);
  vignette(ctx, 0.44);
}

// ── Patio (top-down) ───────────────────────────────────────────────────────

function m(v: number): number {
  return v * PX_PER_M;
}

function paintPatioStatic(ctx: CanvasRenderingContext2D, seed: number): void {
  // asphalt
  ctx.fillStyle = "#33363b";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const r = hashRng(seed, "asphalt");
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${r.chance(0.5) ? "255,255,255" : "0,0,0"},${r.float(0.02, 0.05)})`;
    ctx.fillRect(r.float(0, SCENE_W), r.float(0, SCENE_H), r.float(2, 9), r.float(2, 9));
  }
  // patches and oil stains
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r.float(0.05, 0.12)})`;
    ctx.beginPath();
    ctx.ellipse(r.float(100, SCENE_W - 100), r.float(m(7), m(34)), r.float(12, 40), r.float(8, 22), r.float(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // building roof
  ctx.fillStyle = "#2a2e34";
  ctx.fillRect(0, 0, SCENE_W, m(BUILDING.y1));
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, m(BUILDING.y1), SCENE_W, 6);
  for (let x = 0; x < YARD.w; x += 2) {
    ctx.fillStyle = x % 4 === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)";
    ctx.fillRect(m(x), 0, m(1), m(BUILDING.y1));
  }
  // skylights
  for (let x = 3; x < YARD.w; x += 6) {
    ctx.fillStyle = "rgba(170,200,230,0.22)";
    ctx.fillRect(m(x), m(1.2), m(2.2), m(1.4));
  }
  // dock doors and numbers
  ctx.font = `600 13px ${FONTS.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  DOCK_X.forEach((x, i) => {
    ctx.fillStyle = "#171a1e";
    ctx.fillRect(m(x - DOCK_W / 2), m(BUILDING.y1 - 0.5), m(DOCK_W), m(0.5));
    ctx.fillStyle = "rgba(235,190,60,0.7)";
    ctx.fillRect(m(x - DOCK_W / 2), m(BUILDING.y1), m(DOCK_W), 2);
    ctx.fillStyle = "rgba(232,236,244,0.7)";
    ctx.fillText(`D${i + 1}`, m(x), m(BUILDING.y1 - 1.6));
    // dock bumpers
    ctx.fillStyle = "#111";
    ctx.fillRect(m(x - DOCK_W / 2) + 4, m(BUILDING.y1) + 2, 8, 6);
    ctx.fillRect(m(x + DOCK_W / 2) - 12, m(BUILDING.y1) + 2, 8, 6);
    // parking guide lines for backing in
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m(x - 1.9), m(BUILDING.y1 + 0.4));
    ctx.lineTo(m(x - 1.9), m(BUILDING.y1 + 14));
    ctx.moveTo(m(x + 1.9), m(BUILDING.y1 + 0.4));
    ctx.lineTo(m(x + 1.9), m(BUILDING.y1 + 14));
    ctx.stroke();
  });
  // walkway (painted green with edge lines)
  ctx.fillStyle = "rgba(90,150,110,0.22)";
  ctx.fillRect(m(OFFICE.x1), m(YARD_WALKWAY.y0), m(GATEHOUSE.x0 - OFFICE.x1), m(YARD_WALKWAY.y1 - YARD_WALKWAY.y0));
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(m(OFFICE.x1), m(YARD_WALKWAY.y0), m(GATEHOUSE.x0 - OFFICE.x1), m(YARD_WALKWAY.y1 - YARD_WALKWAY.y0));
  // truck lane: edge lines, dashed centre, direction arrows
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, m(TRUCK_LANE.y0));
  ctx.lineTo(SCENE_W, m(TRUCK_LANE.y0));
  ctx.moveTo(0, m(TRUCK_LANE.y1));
  ctx.lineTo(SCENE_W, m(TRUCK_LANE.y1));
  ctx.stroke();
  ctx.setLineDash([m(1.2), m(1.2)]);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, m(TRUCK_LANE.center));
  ctx.lineTo(SCENE_W, m(TRUCK_LANE.center));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let x = 6; x < YARD.w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(m(x), m(TRUCK_LANE.center));
    ctx.lineTo(m(x + 2.4), m(TRUCK_LANE.center - 0.7));
    ctx.lineTo(m(x + 2.4), m(TRUCK_LANE.center + 0.7));
    ctx.closePath();
    ctx.fill();
  }
  // pedestrian crossing (zebra) and forklift lanes
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(m(CROSSING.x0), m(CROSSING.y0), m(CROSSING.x1 - CROSSING.x0), m(CROSSING.y1 - CROSSING.y0));
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  for (let y = CROSSING.y0 + 0.3; y < CROSSING.y1 - 0.3; y += 1.2) {
    ctx.fillRect(m(CROSSING.x0 + 0.2), m(y), m(CROSSING.x1 - CROSSING.x0 - 0.4), m(0.55));
  }
  ctx.strokeStyle = "rgba(235,190,60,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([m(0.8), m(0.6)]);
  for (const x of [LANE_N - 1.2, LANE_N + 1.2, LANE_S + 1.2]) {
    ctx.beginPath();
    ctx.moveTo(m(x), m(YARD_WALKWAY.y0 - 1.2));
    ctx.lineTo(m(x), m(STAGING.y0));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // lane arrows
  ctx.fillStyle = "rgba(235,190,60,0.5)";
  for (const [x, dir] of [
    [LANE_N, -1],
    [LANE_S, 1],
  ] as const) {
    for (const y of [22.5, 25.5]) {
      ctx.beginPath();
      ctx.moveTo(m(x), m(y + dir * 0.6));
      ctx.lineTo(m(x - 0.45), m(y - dir * 0.3));
      ctx.lineTo(m(x + 0.45), m(y - dir * 0.3));
      ctx.closePath();
      ctx.fill();
    }
  }
  // staging area outline and pallet blocks
  ctx.strokeStyle = "rgba(235,190,60,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(m(STAGING.x0), m(STAGING.y0), m(STAGING.x1 - STAGING.x0), m(STAGING.y1 - STAGING.y0));
  const pr = hashRng(seed, "pallets");
  for (const b of PALLET_BLOCKS) {
    const n = pr.int(2, 4);
    for (let i = 0; i < n; i++) {
      const px = m(b.x) + i * (m(b.w) / n);
      ctx.fillStyle = `hsl(30 30% ${pr.float(26, 40)}%)`;
      ctx.fillRect(px + 1, m(b.y) + 1, m(b.w) / n - 2, m(b.h) - 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(px + 1, m(b.y) + m(b.h) - 5, m(b.w) / n - 2, 4);
    }
  }
  // gatehouse and office blocks
  for (const blk of [GATEHOUSE, OFFICE]) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(m(blk.x0) + 6, m(blk.y0) + 6, m(blk.x1 - blk.x0), m(blk.y1 - blk.y0));
    ctx.fillStyle = "#3d434b";
    ctx.fillRect(m(blk.x0), m(blk.y0), m(blk.x1 - blk.x0), m(blk.y1 - blk.y0));
    ctx.fillStyle = "rgba(170,200,230,0.25)";
    ctx.fillRect(m(blk.x0) + 8, m(blk.y0) + 10, m(blk.x1 - blk.x0) - 16, 8);
  }
  // fence at the bottom
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, m(YARD.h) - 6);
  ctx.lineTo(SCENE_W, m(YARD.h) - 6);
  ctx.stroke();
  for (let x = 0; x < SCENE_W; x += 24) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x, m(YARD.h) - 9, 3, 6);
  }
  // parked cars near the gatehouse
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `hsl(${pr.int(0, 360)} 12% ${pr.float(28, 52)}%)`;
    roundRect(ctx, m(47 + i * 3.2), m(31.5), m(2.1), m(4.2), 6);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(m(47.3 + i * 3.2), m(32.4), m(1.5), m(1.4));
  }
  vignette(ctx, 0.3);
}

// ── Inspección (blade) ─────────────────────────────────────────────────────

let bladeTexture: HTMLCanvasElement | null = null;

function bladeTextureTile(seed: number): HTMLCanvasElement {
  if (bladeTexture) return bladeTexture;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = valueNoise2(seed, x / 45, y / 7) * 0.6 + valueNoise2(seed + 7, x / 5, y / 5) * 0.4;
        const v = 205 + (n - 0.5) * 26;
        const i = (y * size + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v + 1;
        img.data[i + 2] = v - 3;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  bladeTexture = c;
  return c;
}

export function bladeOutline(u: number): { top: Vec2[]; bottom: Vec2[] } {
  const lenPx = BLADE_LENGTH_M * BLADE_PX_M;
  const top: Vec2[] = [];
  const bottom: Vec2[] = [];
  for (let x = -40; x <= SCENE_W + 40; x += 20) {
    const uu = u + (x - 640) / lenPx;
    const hc = uu < 0 || uu > 1 ? 0 : halfChordPx(uu);
    top.push({ x, y: BLADE_CY - hc });
    bottom.push({ x, y: BLADE_CY + hc * 0.92 });
  }
  return { top, bottom };
}

function paintInspeccion(ctx: CanvasRenderingContext2D, seed: number, passT: number, t: number): void {
  const u = cameraU(passT);
  // Ground seen from the drone: no horizon, the camera looks straight at the
  // blade with the field far below and out of focus.
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, "#4a5544");
  g.addColorStop(0.5, "#3f4a3a");
  g.addColorStop(1, "#333c30");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const r = hashRng(seed, "terrain");
  // field patches drifting with the pass, standing in for depth of field
  for (let i = 0; i < 26; i++) {
    const px = ((r.float(0, SCENE_W * 2) - u * 620) % (SCENE_W + 600)) - 300;
    const py = r.float(-40, SCENE_H + 40);
    ctx.fillStyle = r.chance(0.55) ? "rgba(84,102,66,0.5)" : "rgba(118,114,84,0.42)";
    ctx.beginPath();
    ctx.ellipse(px, py, r.float(110, 320), r.float(50, 130), r.float(-0.3, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const px = ((r.float(0, SCENE_W * 2) - u * 620) % (SCENE_W + 600)) - 300;
    ctx.strokeStyle = "rgba(150,143,110,0.22)";
    ctx.lineWidth = r.float(6, 16);
    ctx.beginPath();
    ctx.moveTo(px, -40);
    ctx.lineTo(px + r.float(-140, 140), SCENE_H + 40);
    ctx.stroke();
  }
  // blade
  const { top, bottom } = bladeOutline(u);
  // the blade's own shadow cast on the field, far below and offset
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#101408";
  ctx.beginPath();
  top.forEach((p, i) => (i ? ctx.lineTo(p.x + 42, p.y + 168) : ctx.moveTo(p.x + 42, p.y + 168)));
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo((bottom[i]?.x ?? 0) + 42, (bottom[i]?.y ?? 0) + 168);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i]?.x ?? 0, bottom[i]?.y ?? 0);
  ctx.closePath();
  ctx.fillStyle = "#d3d5d1";
  ctx.fill();
  ctx.clip();
  // surface texture slides with the camera
  const tile = bladeTextureTile(seed);
  const shift = -((u * BLADE_LENGTH_M * BLADE_PX_M) % 256);
  ctx.globalAlpha = 0.55;
  for (let x = shift - 256; x < SCENE_W + 256; x += 256) {
    for (let y = -256; y < SCENE_H; y += 256) ctx.drawImage(tile, x, y);
  }
  ctx.globalAlpha = 1;
  // chord shading: leading edge (top) brighter, trailing edge darker
  const sg = ctx.createLinearGradient(0, BLADE_CY - 260, 0, BLADE_CY + 240);
  sg.addColorStop(0, "rgba(255,255,255,0.22)");
  sg.addColorStop(0.35, "rgba(255,255,255,0)");
  sg.addColorStop(0.7, "rgba(0,0,0,0.08)");
  sg.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // seam line along the blade and metre markers
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + 28) : ctx.moveTo(p.x, p.y + 28)));
  ctx.stroke();
  ctx.font = `10px ${FONTS.mono}`;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.textAlign = "center";
  const lenPx = BLADE_LENGTH_M * BLADE_PX_M;
  for (let metre = 0; metre <= BLADE_LENGTH_M; metre += 5) {
    const x = 640 + (metre / BLADE_LENGTH_M - u) * lenPx;
    if (x < -20 || x > SCENE_W + 20) continue;
    ctx.fillRect(x - 0.5, BLADE_CY + 40, 1, 12);
    ctx.fillText(`${metre}`, x, BLADE_CY + 64);
  }
  ctx.restore();
  // edge shadow below the blade
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  bottom.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + 1) : ctx.moveTo(p.x, p.y + 1)));
  ctx.stroke();
  vignette(ctx, 0.28);
}

// ── Documentos ─────────────────────────────────────────────────────────────

function paintDocumento(ctx: CanvasRenderingContext2D, seed: number, docIdx: number): void {
  const remito = REMITOS[docIdx % REMITOS.length] ?? REMITOS[0];
  if (!remito) return;
  ctx.fillStyle = "#1a1c21";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // scanner bed texture
  const r = hashRng(seed, "scanner", docIdx);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r.float(0.01, 0.03)})`;
    ctx.fillRect(r.float(0, SCENE_W), r.float(0, SCENE_H), r.float(1, 4), r.float(1, 4));
  }
  ctx.save();
  ctx.translate(DOC.x + DOC.w / 2, DOC.y + DOC.h / 2);
  ctx.rotate(0.004);
  ctx.translate(-(DOC.x + DOC.w / 2), -(DOC.y + DOC.h / 2));
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(DOC.x + 6, DOC.y + 8, DOC.w, DOC.h);
  ctx.fillStyle = "#ecebe4";
  ctx.fillRect(DOC.x, DOC.y, DOC.w, DOC.h);
  const pg = ctx.createLinearGradient(DOC.x, DOC.y, DOC.x + DOC.w, DOC.y + DOC.h);
  pg.addColorStop(0, "rgba(0,0,0,0)");
  pg.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = pg;
  ctx.fillRect(DOC.x, DOC.y, DOC.w, DOC.h);
  const X = (u: number) => DOC.x + u * DOC.w;
  const Y = (v: number) => DOC.y + v * DOC.h;
  const ink = "#2b2d33";
  const faint = "#6d7078";
  ctx.fillStyle = ink;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `700 22px ${FONTS.sans}`;
  ctx.fillText(remito.supplier.toUpperCase(), X(0.07), Y(0.05));
  ctx.font = `11px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("Av. Circunvalación 2140 · Rosario · Santa Fe · IVA Responsable Inscripto", X(0.07), Y(0.092));
  ctx.fillText(`CUIT ${remito.cuit} · Ingresos Brutos ${remito.cuit.slice(3, 11)} · Inicio de actividades 03/2009`, X(0.07), Y(0.115));
  // remito box
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(X(0.6), Y(0.045), X(0.95) - X(0.6), Y(0.16) - Y(0.045));
  ctx.fillStyle = ink;
  ctx.font = `700 15px ${FONTS.sans}`;
  ctx.fillText("REMITO", X(0.62), Y(0.052));
  ctx.font = `600 12px ${FONTS.mono}`;
  ctx.fillText(`N° ${remito.number}`, X(0.62), Y(0.078));
  ctx.font = `11px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("Fecha de emisión", X(0.62), Y(0.104));
  ctx.fillStyle = ink;
  ctx.font = `12px ${FONTS.mono}`;
  ctx.fillText(remito.date, X(0.62), Y(0.121));
  ctx.font = `600 11px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("ORIGINAL", X(0.86), Y(0.052));
  // header fields
  ctx.fillStyle = ink;
  const label = (txt: string, x: number, y: number) => {
    ctx.font = `10px ${FONTS.sans}`;
    ctx.fillStyle = faint;
    ctx.fillText(txt.toUpperCase(), X(x), Y(y) - 13);
  };
  const value = (txt: string, x: number, y: number, mono = false) => {
    ctx.font = mono ? `12px ${FONTS.mono}` : `12px ${FONTS.sans}`;
    ctx.fillStyle = ink;
    ctx.fillText(txt, X(x), Y(y) + 3);
  };
  label("Proveedor", 0.07, 0.19);
  value(remito.supplier, 0.07, 0.19);
  label("CUIT", 0.07, 0.228);
  value(remito.cuit, 0.07, 0.228, true);
  label("Origen", 0.07, 0.266);
  value(remito.origin, 0.07, 0.266);
  label("Destino", 0.62, 0.19);
  value("Vantor Group · CD Norte", 0.62, 0.19);
  label("Dirección de entrega", 0.62, 0.228);
  value("Ruta 9 km 36.5 · Pacheco", 0.62, 0.228);
  label("Condición", 0.62, 0.266);
  value("Cuenta corriente 30 días", 0.62, 0.266);
  label("Transporte", 0.07, 0.318);
  value(remito.carrier, 0.07, 0.318);
  label("Patente", 0.62, 0.318);
  value(remito.plate, 0.62, 0.318, true);
  label("Chofer", 0.62, 0.356);
  value(remito.driver, 0.62, 0.356);
  label("Dársena", 0.07, 0.356);
  value(remito.dock, 0.07, 0.356);
  // items table
  const y0 = 0.45;
  ctx.strokeStyle = "rgba(43,45,51,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(0.06), Y(y0) - 6);
  ctx.lineTo(X(0.94), Y(y0) - 6);
  ctx.stroke();
  ctx.font = `600 10px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("CÓDIGO", X(0.07), Y(y0) - 20);
  ctx.fillText("DESCRIPCIÓN", X(0.25), Y(y0) - 20);
  ctx.textAlign = "right";
  ctx.fillText("CANTIDAD", X(0.92), Y(y0) - 20);
  ctx.textAlign = "left";
  const fields = layoutRemito(remito);
  for (const f of fields) {
    if (f.group !== "item") continue;
    ctx.fillStyle = ink;
    if (f.field === "sku") {
      ctx.font = `12px ${FONTS.mono}`;
      ctx.fillText(f.value, X(f.box.x), Y(f.box.y) + 3);
    } else if (f.field === "descripcion") {
      ctx.font = `12px ${FONTS.sans}`;
      ctx.fillText(f.value, X(f.box.x), Y(f.box.y) + 3);
    } else {
      ctx.font = `12px ${FONTS.mono}`;
      ctx.textAlign = "right";
      ctx.fillText(f.value, X(f.box.x + f.box.w), Y(f.box.y) + 3);
      ctx.textAlign = "left";
    }
    ctx.strokeStyle = "rgba(43,45,51,0.12)";
    ctx.beginPath();
    ctx.moveTo(X(0.06), Y(f.box.y + 0.04));
    ctx.lineTo(X(0.94), Y(f.box.y + 0.04));
    ctx.stroke();
  }
  // totals
  const total = remito.lines.reduce((a, l) => a + l.expected, 0);
  ctx.font = `600 11px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("TOTAL UNIDADES", X(0.6), Y(0.785));
  ctx.font = `700 14px ${FONTS.mono}`;
  ctx.fillStyle = ink;
  ctx.textAlign = "right";
  ctx.fillText(String(total), X(0.92), Y(0.782));
  ctx.textAlign = "left";
  ctx.font = `10px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText(`Bultos: ${remito.lines.length} líneas · Mercadería viaja por cuenta y riesgo del comprador.`, X(0.07), Y(0.8));
  // signature (bezier scribble) and clarification
  ctx.strokeStyle = "#20305a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const sr = hashRng(seed, "sig", docIdx);
  const sx = X(0.09);
  const sy = Y(0.9);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < 9; i++) {
    ctx.bezierCurveTo(sx + i * 18 + sr.float(-6, 14), sy + sr.float(-30, 8), sx + i * 18 + sr.float(0, 20), sy + sr.float(-4, 28), sx + (i + 1) * 18, sy + sr.float(-10, 10));
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(43,45,51,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(0.08), Y(0.94));
  ctx.lineTo(X(0.32), Y(0.94));
  ctx.stroke();
  ctx.font = `10px ${FONTS.sans}`;
  ctx.fillStyle = faint;
  ctx.fillText("Firma y aclaración del receptor", X(0.08), Y(0.975));
  ctx.font = `11px ${FONTS.sans}`;
  ctx.fillStyle = ink;
  ctx.fillText("G. Farías · Muelle", X(0.08), Y(0.947));
  // stamp
  ctx.save();
  ctx.translate(X(0.72), Y(0.9));
  ctx.rotate(-0.12);
  ctx.strokeStyle = "rgba(40,70,160,0.55)";
  ctx.lineWidth = 2;
  roundRect(ctx, -70, -22, 140, 44, 4);
  ctx.stroke();
  ctx.fillStyle = "rgba(40,70,160,0.6)";
  ctx.font = `700 12px ${FONTS.sans}`;
  ctx.textAlign = "center";
  ctx.fillText("RECIBIDO CONFORME", 0, -14);
  ctx.font = `10px ${FONTS.mono}`;
  ctx.fillText(`CD NORTE · ${remito.date}`, 0, 4);
  ctx.restore();
  ctx.restore();
  vignette(ctx, 0.35);
}

// ── entry point ────────────────────────────────────────────────────────────

export function paintScene(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { module, seed, dpr } = input;
  switch (module) {
    case "recepcion":
      blitLayer(ctx, staticLayer(`bg:recepcion:${seed}`, dpr, (c) => paintRecepcionStatic(c, seed)));
      paintRecepcionDynamic(ctx, input.t);
      break;
    case "seguridad":
      blitLayer(ctx, staticLayer(`bg:seguridad:${seed}`, dpr, (c) => paintSeguridadStatic(c, seed)));
      break;
    case "flujo":
      blitLayer(ctx, staticLayer(`bg:flujo:${seed}`, dpr, (c) => paintFlujoStatic(c, seed)));
      break;
    case "patio":
      blitLayer(ctx, staticLayer(`bg:patio:${seed}`, dpr, (c) => paintPatioStatic(c, seed)));
      break;
    case "inspeccion":
      paintInspeccion(ctx, seed, input.param, input.t);
      break;
    case "documentos":
      blitLayer(ctx, staticLayer(`bg:doc:${seed}:${Math.floor(input.param)}`, dpr, (c) => paintDocumento(c, seed, Math.floor(input.param))));
      break;
  }
}

/** Sensor noise + light flicker on top of the agents, below the annotations. */
export function paintVideoGrain(ctx: CanvasRenderingContext2D, t: number, seed: number, strength = 0.06): void {
  const tile = getNoiseTile();
  const r = hashRng(seed, "grain", Math.floor(t * 30));
  const ox = r.int(0, 255);
  const oy = r.int(0, 255);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = "overlay";
  for (let y = -oy; y < SCENE_H; y += 256) {
    for (let x = -ox; x < SCENE_W; x += 256) ctx.drawImage(tile, x, y);
  }
  ctx.restore();
  // faint flicker of the fluorescent lighting
  const flick = 0.985 + Math.sin(t * 50.3) * 0.006 + Math.sin(t * 7.7) * 0.004;
  if (flick < 0.99) {
    ctx.fillStyle = `rgba(0,0,0,${(0.99 - flick) * 2})`;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  }
}

export function hex(color: string, alpha: number): string {
  return hexAlpha(color, alpha);
}
