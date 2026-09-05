import { project, scaleAt, type Camera } from "@/lib/sim/camera";
import { hashRng } from "@/lib/sim/rng";
import { BELT, BELT_ANGLE, beltPoint, RECEPCION_CAM, type RecepcionData } from "@/lib/sim/modules/recepcion";
import { SEGURIDAD_CAM } from "@/lib/sim/modules/seguridad";
import { FLUJO_CAM } from "@/lib/sim/modules/flujo";
import { PX_PER_M } from "@/lib/sim/modules/patio";
import { cameraU, defectScreenBox, type InspeccionData } from "@/lib/sim/modules/inspeccion";
import { personView } from "@/lib/sim/modules/shared";
import type { BoxEntity, DefectEntity, ModuleId, PalletEntity, PersonEntity, Vec2, VehicleEntity } from "@/lib/sim/types";
import type { World, WorldState } from "@/lib/sim/world";
import { polyPath } from "./canvas";

/**
 * Layer 2: the things the camera is looking at. Drawn from world state, in
 * the same "video" style as the background, so the raw feed reads as footage.
 */

function corners(cam: Camera, x: number, y: number, z: number, w: number, h: number, d: number, yaw: number): Vec2[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const out: Vec2[] = [];
  for (let i = 0; i < 8; i++) {
    const lx = (i & 1 ? 0.5 : -0.5) * w;
    const lz = (i & 2 ? 0.5 : -0.5) * d;
    const ly = i & 4 ? h : 0;
    out.push(project(cam, x + lx * c - lz * s, y + ly, z + lx * s + lz * c));
  }
  return out;
}

interface Face {
  pts: Vec2[];
  n: Vec2;
  center: Vec2;
}

function visibleFaces(cam: Camera, x: number, z: number, w: number, d: number, yaw: number, cs: Vec2[]): Face[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const a = { x: c, y: s };
  const b = { x: -s, y: c };
  // corner indices: bit0 = +a, bit1 = +b, bit2 = top
  const faces: Array<{ idx: [number, number, number, number]; n: Vec2; off: Vec2 }> = [
    { idx: [1, 3, 7, 5], n: a, off: { x: a.x * w * 0.5, y: a.y * w * 0.5 } },
    { idx: [0, 2, 6, 4], n: { x: -a.x, y: -a.y }, off: { x: -a.x * w * 0.5, y: -a.y * w * 0.5 } },
    { idx: [2, 3, 7, 6], n: b, off: { x: b.x * d * 0.5, y: b.y * d * 0.5 } },
    { idx: [0, 1, 5, 4], n: { x: -b.x, y: -b.y }, off: { x: -b.x * d * 0.5, y: -b.y * d * 0.5 } },
  ];
  const out: Face[] = [];
  for (const f of faces) {
    const center = { x: x + f.off.x, y: z + f.off.y };
    // camera sits at the origin of floor space looking down +z
    if (f.n.x * center.x + f.n.y * center.y < 0) {
      out.push({ pts: f.idx.map((i) => cs[i] as Vec2), n: f.n, center });
    }
  }
  return out;
}

function quadPoint(q: Vec2[], u: number, v: number): Vec2 {
  const [p0, p1, p2, p3] = q as [Vec2, Vec2, Vec2, Vec2];
  const top = { x: p3.x + (p2.x - p3.x) * u, y: p3.y + (p2.y - p3.y) * u };
  const bottom = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
  return { x: bottom.x + (top.x - bottom.x) * v, y: bottom.y + (top.y - bottom.y) * v };
}

function drawBox(ctx: CanvasRenderingContext2D, cam: Camera, b: BoxEntity): void {
  const p = beltPoint(b.s, b.lateral);
  const yaw = BELT_ANGLE + b.yaw;
  const cs = corners(cam, p.x, BELT.height, p.y, b.dims.w, b.dims.h, b.dims.d, yaw);
  const L = 30 + b.tone * 26;
  const hue = 31;
  const sat = 36;
  // shadow on the belt
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  polyPath(ctx, [cs[0] as Vec2, cs[1] as Vec2, cs[3] as Vec2, cs[2] as Vec2]);
  ctx.fill();
  const faces = visibleFaces(cam, p.x, p.y, b.dims.w, b.dims.d, yaw, cs);
  faces.forEach((f, i) => {
    const light = 0.5 - f.n.x * 0.25 - f.n.y * 0.15;
    ctx.fillStyle = `hsl(${hue} ${sat}% ${L * (0.62 + light * 0.5)}%)`;
    polyPath(ctx, f.pts);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (i === 0) {
      // shipping label on the most visible face
      const c0 = quadPoint(f.pts, 0.32, 0.36);
      const c1 = quadPoint(f.pts, 0.68, 0.36);
      const c2 = quadPoint(f.pts, 0.68, 0.64);
      const c3 = quadPoint(f.pts, 0.32, 0.64);
      ctx.fillStyle = "rgba(240,240,236,0.92)";
      polyPath(ctx, [c0, c1, c2, c3]);
      ctx.fill();
      const l0 = quadPoint(f.pts, 0.36, 0.56);
      const l1 = quadPoint(f.pts, 0.64, 0.56);
      ctx.strokeStyle = "rgba(20,20,20,0.75)";
      ctx.lineWidth = Math.max(0.6, (c2.y - c1.y) * 0.16);
      ctx.beginPath();
      ctx.moveTo(l0.x, l0.y);
      ctx.lineTo(l1.x, l1.y);
      ctx.stroke();
    }
    if (b.damaged && i === faces.length - 1) {
      const d0 = quadPoint(f.pts, 0.0, 0.0);
      const d1 = quadPoint(f.pts, 0.42, 0.0);
      const d2 = quadPoint(f.pts, 0.3, 0.55);
      const d3 = quadPoint(f.pts, 0.0, 0.7);
      ctx.fillStyle = `hsl(${hue} 30% ${L * 0.45}%)`;
      polyPath(ctx, [d0, d1, d2, d3]);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.lineTo(d3.x, d3.y);
      ctx.stroke();
    }
  });
  // top face
  const top: [Vec2, Vec2, Vec2, Vec2] = [cs[4] as Vec2, cs[5] as Vec2, cs[7] as Vec2, cs[6] as Vec2];
  if (b.damaged) {
    top[1] = { x: top[1].x + (top[2].x - top[1].x) * 0.12, y: top[1].y + (top[3].y - top[1].y) * 0.14 + 2 };
  }
  ctx.fillStyle = `hsl(${hue} ${sat}% ${L * 1.18}%)`;
  polyPath(ctx, top);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // tape
  const t0 = quadPoint(top, 0.5, 0.0);
  const t1 = quadPoint(top, 0.5, 1.0);
  ctx.strokeStyle = "rgba(200,190,170,0.75)";
  ctx.lineWidth = Math.max(1, Math.hypot(top[1].x - top[0].x, top[1].y - top[0].y) * 0.1);
  ctx.beginPath();
  ctx.moveTo(t0.x, t0.y);
  ctx.lineTo(t1.x, t1.y);
  ctx.stroke();
  if (b.open) {
    const f0 = quadPoint(top, 0.5, 0.0);
    const f1 = quadPoint(top, 0.5, 1.0);
    const lift = Math.hypot(top[1].x - top[0].x, top[1].y - top[0].y) * 0.3;
    ctx.fillStyle = `hsl(${hue} ${sat}% ${L * 1.28}%)`;
    polyPath(ctx, [top[0], f0, { x: f0.x - lift * 0.3, y: f0.y - lift }, { x: top[0].x, y: top[0].y - lift * 0.8 }]);
    ctx.fill();
    polyPath(ctx, [top[3], f1, { x: f1.x - lift * 0.3, y: f1.y - lift }, { x: top[3].x, y: top[3].y - lift * 0.8 }]);
    ctx.fill();
  }
}

function drawPallet(ctx: CanvasRenderingContext2D, cam: Camera, p: PalletEntity): void {
  const w = 1.2;
  const d = 1.0;
  const cs = corners(cam, p.pos.x, 0, p.pos.y, w, 0.15, d, 0.08);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  polyPath(ctx, [cs[0] as Vec2, cs[1] as Vec2, cs[3] as Vec2, cs[2] as Vec2]);
  ctx.fill();
  const faces = visibleFaces(cam, p.pos.x, p.pos.y, w, d, 0.08, cs);
  for (const f of faces) {
    ctx.fillStyle = "hsl(28 30% 30%)";
    polyPath(ctx, f.pts);
    ctx.fill();
  }
  ctx.fillStyle = "hsl(28 30% 38%)";
  polyPath(ctx, [cs[4] as Vec2, cs[5] as Vec2, cs[7] as Vec2, cs[6] as Vec2]);
  ctx.fill();
  const r = hashRng(p.id, "pallet");
  const layerH = 0.3;
  for (let l = 0; l < p.layers; l++) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const bx = p.pos.x + (i - 0.5) * 0.56;
        const bz = p.pos.y + (j - 0.5) * 0.48;
        const bc = corners(cam, bx, 0.15 + l * layerH, bz, 0.54, layerH - 0.02, 0.46, 0.08);
        const L = 32 + r.float(-4, 6) + p.tone * 10;
        const vf = visibleFaces(cam, bx, bz, 0.54, 0.46, 0.08, bc);
        for (const f of vf) {
          ctx.fillStyle = `hsl(31 34% ${L * (0.72 - f.n.x * 0.15)}%)`;
          polyPath(ctx, f.pts);
          ctx.fill();
        }
        ctx.fillStyle = `hsl(31 34% ${L * 1.1}%)`;
        polyPath(ctx, [bc[4] as Vec2, bc[5] as Vec2, bc[7] as Vec2, bc[6] as Vec2]);
        ctx.fill();
      }
    }
  }
  if (p.film) {
    const h = 0.15 + p.layers * layerH;
    const hull = corners(cam, p.pos.x, 0.12, p.pos.y, w + 0.02, h - 0.1, d + 0.02, 0.08);
    const vf = visibleFaces(cam, p.pos.x, p.pos.y, w, d, 0.08, hull);
    for (const f of vf) {
      const g = ctx.createLinearGradient(f.pts[0]?.x ?? 0, 0, f.pts[1]?.x ?? 0, 0);
      g.addColorStop(0, "rgba(205,225,245,0.14)");
      g.addColorStop(0.5, "rgba(230,240,255,0.32)");
      g.addColorStop(1, "rgba(205,225,245,0.14)");
      ctx.fillStyle = g;
      polyPath(ctx, f.pts);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(230,240,255,0.22)";
    polyPath(ctx, [hull[4] as Vec2, hull[5] as Vec2, hull[7] as Vec2, hull[6] as Vec2]);
    ctx.fill();
  }
}

const SKIN = ["#c69c7b", "#a97c5b", "#8d5f43", "#d9b394", "#6f4a34"];

function drawPerson(ctx: CanvasRenderingContext2D, cam: Camera, p: PersonEntity): void {
  const v = personView(cam, p);
  const kp = v.pose;
  const ppm = scaleAt(cam, p.pos.y);
  const r = hashRng(p.id, "look");
  const skin = SKIN[r.int(0, SKIN.length - 1)] ?? "#c69c7b";
  const pants = r.chance(0.5) ? "#2a2f3a" : "#3a3d42";
  const shirt = p.vest ? (p.shirt < 0.55 ? "#d9772e" : "#c9c531") : `hsl(${r.int(190, 230)} ${r.int(8, 22)}% ${r.int(26, 44)}%)`;
  const helmetColor = r.chance(0.6) ? "#e7e4d9" : "#e2c24c";
  const get = (i: number): Vec2 => kp[i] ?? { x: 0, y: 0 };
  // shadow
  const feet = project(cam, p.pos.x, 0, p.pos.y);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y, 0.34 * ppm, 0.12 * ppm, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // legs
  ctx.strokeStyle = pants;
  ctx.lineWidth = Math.max(1.5, 0.15 * ppm);
  for (const [a, b, c] of [
    [11, 13, 15],
    [12, 14, 16],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(get(a).x, get(a).y);
    ctx.lineTo(get(b).x, get(b).y);
    ctx.lineTo(get(c).x, get(c).y);
    ctx.stroke();
  }
  // torso
  ctx.fillStyle = shirt;
  polyPath(ctx, [get(5), get(6), get(12), get(11)]);
  ctx.fill();
  ctx.strokeStyle = shirt;
  ctx.lineWidth = Math.max(1.5, 0.2 * ppm);
  ctx.stroke();
  if (p.vest) {
    ctx.strokeStyle = "rgba(240,240,240,0.7)";
    ctx.lineWidth = Math.max(1, 0.035 * ppm);
    const sL = get(5);
    const sR = get(6);
    const hL = get(11);
    const hR = get(12);
    ctx.beginPath();
    ctx.moveTo(sL.x + (hL.x - sL.x) * 0.55, sL.y + (hL.y - sL.y) * 0.55);
    ctx.lineTo(sR.x + (hR.x - sR.x) * 0.55, sR.y + (hR.y - sR.y) * 0.55);
    ctx.moveTo(sL.x + (hL.x - sL.x) * 0.75, sL.y + (hL.y - sL.y) * 0.75);
    ctx.lineTo(sR.x + (hR.x - sR.x) * 0.75, sR.y + (hR.y - sR.y) * 0.75);
    ctx.stroke();
  }
  // arms
  ctx.lineWidth = Math.max(1.2, 0.11 * ppm);
  for (const [a, b, c] of [
    [5, 7, 9],
    [6, 8, 10],
  ] as const) {
    ctx.strokeStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(get(a).x, get(a).y);
    ctx.lineTo(get(b).x, get(b).y);
    ctx.stroke();
    ctx.strokeStyle = skin;
    ctx.beginPath();
    ctx.moveTo(get(b).x, get(b).y);
    ctx.lineTo(get(c).x, get(c).y);
    ctx.stroke();
  }
  // head
  const nose = get(0);
  const earL = get(3);
  const earR = get(4);
  const hx = (earL.x + earR.x) / 2;
  const hy = (earL.y + earR.y) / 2 - 0.02 * ppm;
  const hr = Math.max(2, 0.115 * ppm);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  void nose;
  if (p.helmet) {
    ctx.fillStyle = helmetColor;
    ctx.beginPath();
    ctx.arc(hx, hy - hr * 0.15, hr * 1.12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx - hr * 1.25, hy - hr * 0.2, hr * 2.5, hr * 0.28);
  } else {
    ctx.fillStyle = "#2a2118";
    ctx.beginPath();
    ctx.arc(hx, hy - hr * 0.1, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }
}

// ── top-down ───────────────────────────────────────────────────────────────

function drawTruck(ctx: CanvasRenderingContext2D, v: VehicleEntity): void {
  const L = v.length * PX_PER_M;
  const W = v.width * PX_PER_M;
  const cab = v.kind === "camion" ? 2.4 * PX_PER_M : 0;
  ctx.save();
  ctx.translate(v.pos.x * PX_PER_M, v.pos.y * PX_PER_M);
  ctx.rotate(v.heading);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-L / 2 + 5, -W / 2 + 6, L, W);
  // trailer: a light box, but kept well under the panel whites so it does not
  // become the brightest thing on the screen
  const light = 48 + v.tone * 12;
  ctx.fillStyle = `hsl(${v.tone > 0.5 ? 210 : 40} 7% ${light}%)`;
  ctx.fillRect(-L / 2, -W / 2, L - cab, W);
  const sheen = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  sheen.addColorStop(0, "rgba(255,255,255,0.1)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-L / 2, -W / 2, L - cab, W);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-L / 2, -W / 2, L - cab, W);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  for (let x = -L / 2 + 10; x < L / 2 - cab - 4; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, -W / 2 + 2);
    ctx.lineTo(x, W / 2 - 2);
    ctx.stroke();
  }
  // cab
  ctx.fillStyle = `hsl(${v.tone > 0.5 ? 0 : 215} ${20 + v.tone * 30}% ${28 + v.tone * 14}%)`;
  ctx.fillRect(L / 2 - cab, -W / 2, cab, W);
  ctx.fillStyle = "rgba(160,190,220,0.6)";
  ctx.fillRect(L / 2 - cab * 0.45, -W / 2 + 4, 5, W - 8);
  // wheels
  ctx.fillStyle = "#15171b";
  for (const x of [-L / 2 + 14, -L / 2 + 30, L / 2 - cab - 8, L / 2 - 8]) {
    ctx.fillRect(x - 4, -W / 2 - 2, 8, 5);
    ctx.fillRect(x - 4, W / 2 - 3, 8, 5);
  }
  ctx.restore();
}

function drawForklift(ctx: CanvasRenderingContext2D, v: VehicleEntity): void {
  const L = v.length * PX_PER_M;
  const W = v.width * PX_PER_M;
  ctx.save();
  ctx.translate(v.pos.x * PX_PER_M, v.pos.y * PX_PER_M);
  ctx.rotate(v.heading);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-L / 2 + 4, -W / 2 + 5, L, W);
  // body
  ctx.fillStyle = "#c79a3a";
  ctx.fillRect(-L / 2, -W / 2, L * 0.72, W);
  ctx.fillStyle = "#1f2226";
  ctx.fillRect(-L / 2 - 3, -W / 2 + 1, 6, W - 2);
  // overhead guard
  ctx.strokeStyle = "#2d3138";
  ctx.lineWidth = 2;
  ctx.strokeRect(-L / 2 + L * 0.2, -W / 2 + 2, L * 0.36, W - 4);
  // driver
  ctx.fillStyle = "#e7e4d9";
  ctx.beginPath();
  ctx.arc(-L / 2 + L * 0.38, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // mast + forks
  ctx.fillStyle = "#15171b";
  ctx.fillRect(L * 0.22, -W / 2, 5, W);
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(L * 0.27, -W * 0.3, L * 0.34, 3);
  ctx.fillRect(L * 0.27, W * 0.3 - 3, L * 0.34, 3);
  if (v.carrying) {
    ctx.fillStyle = "hsl(30 32% 34%)";
    ctx.fillRect(L * 0.28, -W * 0.48, L * 0.36, W * 0.96);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(L * 0.28, -W * 0.48, L * 0.36, 3);
  }
  // wheels
  ctx.fillStyle = "#101216";
  ctx.fillRect(-L / 2 + 6, -W / 2 - 2, 8, 4);
  ctx.fillRect(-L / 2 + 6, W / 2 - 2, 8, 4);
  ctx.fillRect(L * 0.06, -W / 2 - 2, 9, 4);
  ctx.fillRect(L * 0.06, W / 2 - 2, 9, 4);
  ctx.restore();
}

function drawPedestrian(ctx: CanvasRenderingContext2D, p: PersonEntity): void {
  const x = p.pos.x * PX_PER_M;
  const y = p.pos.y * PX_PER_M;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.heading);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(3, 4, 8, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.shirt < 0.5 ? "#d9772e" : "#c9c531";
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e7e4d9";
  ctx.beginPath();
  ctx.arc(1.5, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── blade defects (raw appearance) ─────────────────────────────────────────

function drawDefect(ctx: CanvasRenderingContext2D, e: DefectEntity, u: number): void {
  const b = defectScreenBox(e, u);
  if (b.cx + b.w < -50 || b.cx - b.w > 1330) return;
  const pts = e.poly.map((p) => ({ x: b.cx + (p.x * b.w) / 2, y: b.cy + (p.y * b.h) / 2 }));
  const r = hashRng(e.id, "defect");
  switch (e.type) {
    case "erosion": {
      polyPath(ctx, pts);
      ctx.fillStyle = "rgba(96,86,74,0.55)";
      ctx.fill();
      ctx.fillStyle = "rgba(40,36,32,0.6)";
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc(b.cx + r.float(-b.w / 2, b.w / 2), b.cy + r.float(-b.h / 2, b.h / 2), r.float(0.8, 2.6), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "grieta": {
      polyPath(ctx, pts);
      ctx.fillStyle = "rgba(44,42,46,0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case "delaminacion": {
      polyPath(ctx, pts);
      ctx.fillStyle = "rgba(120,112,100,0.38)";
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? "rgba(235,232,224,0.5)" : "rgba(90,84,76,0.35)";
        ctx.beginPath();
        ctx.ellipse(b.cx + r.float(-b.w / 3, b.w / 3), b.cy + r.float(-b.h / 3, b.h / 3), r.float(3, b.w / 5), r.float(2, b.h / 5), r.float(0, 3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "rayo": {
      polyPath(ctx, pts);
      ctx.fillStyle = "rgba(34,30,30,0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(20,18,18,0.5)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const a = r.float(0, Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(b.cx, b.cy);
        ctx.lineTo(b.cx + Math.cos(a) * b.w * r.float(0.5, 0.9), b.cy + Math.sin(a) * b.h * r.float(0.5, 0.9));
        ctx.stroke();
      }
      break;
    }
    case "pintura": {
      polyPath(ctx, pts);
      ctx.fillStyle = "rgba(238,236,228,0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(120,112,100,0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      break;
    }
  }
}

// ── entry point ────────────────────────────────────────────────────────────

export function paintAgents(ctx: CanvasRenderingContext2D, module: ModuleId, world: World<unknown>, t: number): void {
  void t;
  const entities = world.state.entities;
  switch (module) {
    case "recepcion": {
      const items: Array<{ z: number; draw: () => void }> = [];
      for (const e of entities) {
        if (e.kind === "caja") {
          if (e.s < -0.02 || e.s > 1.06) continue;
          const z = beltPoint(e.s).y;
          items.push({ z, draw: () => drawBox(ctx, RECEPCION_CAM, e) });
        } else if (e.kind === "pallet") {
          items.push({ z: e.pos.y, draw: () => drawPallet(ctx, RECEPCION_CAM, e) });
        }
      }
      items.sort((a, b) => b.z - a.z);
      for (const it of items) it.draw();
      void (world.state as WorldState<RecepcionData>).data;
      break;
    }
    case "seguridad":
    case "flujo": {
      const cam = module === "seguridad" ? SEGURIDAD_CAM : FLUJO_CAM;
      const people = entities.filter((e): e is PersonEntity => e.kind === "persona" && e.pos.y > 1.9);
      people.sort((a, b) => b.pos.y - a.pos.y);
      for (const p of people) drawPerson(ctx, cam, p);
      break;
    }
    case "patio": {
      for (const e of entities) if (e.kind === "camion") drawTruck(ctx, e);
      for (const e of entities) if (e.kind === "montacarga") drawForklift(ctx, e);
      for (const e of entities) if (e.kind === "persona") drawPedestrian(ctx, e);
      break;
    }
    case "inspeccion": {
      const st = world.state as WorldState<InspeccionData>;
      const u = cameraU(st.data.passT);
      for (const e of entities) if (e.kind === "defecto") drawDefect(ctx, e, u);
      break;
    }
    case "documentos":
      break;
  }
}
