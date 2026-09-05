import { clamp, project, SCENE_H, SCENE_W, type Camera } from "@/lib/sim/camera";
import type { ActiveClass, FeedSettings, ModuleFrames } from "@/lib/sim/engine";
import { FLOOR, HEAT_COLS, HEAT_ROWS } from "@/lib/sim/modules/flujo";
import type { Box, Detection, ModuleId, Vec2, Zone } from "@/lib/sim/types";
import { FONTS, hexAlpha, polyPath, roundRect } from "./canvas";

/**
 * Layer 3: what the detector says. Boxes interpolate between the last two
 * inference frames so they glide with a one-frame lag, exactly like a real
 * overlay; a box that the detector dropped for a frame simply is not drawn.
 */

export const COLORS = {
  ok: "#76B900",
  warn: "#F5A524",
  alert: "#E5484D",
  track: "#4CC9F0",
  text: "#E8ECF4",
  muted: "#8892A6",
  chipBg: "rgba(6,8,15,0.84)",
};

const BONES: Array<[number, number]> = [
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 6],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [0, 5],
  [0, 6],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
];

export interface DisplayDetection {
  det: Detection;
  box: Box;
  pose?: Vec2[];
  mask?: Vec2[];
  opacity: number;
  chip: boolean;
}

function lerpBox(a: Box, b: Box, k: number): Box {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

function lerpPts(a: Vec2[] | undefined, b: Vec2[] | undefined, k: number): Vec2[] | undefined {
  if (!b) return undefined;
  if (!a || a.length !== b.length) return b;
  return b.map((p, i) => {
    const q = a[i] ?? p;
    return { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
  });
}

/** Detections to draw at time `t`, interpolated from the last two frames. */
export function displayDetections(frames: ModuleFrames, t: number): DisplayDetection[] {
  const curr = frames.curr;
  if (!curr) return [];
  const prev = frames.prev;
  const interval = prev ? Math.max(0.03, curr.t - prev.t) : 0.1;
  const k = clamp((t - curr.t) / interval, 0, 1);
  const out: DisplayDetection[] = [];
  for (const det of curr.detections) {
    const match = prev?.detections.find((d) => d.trackId === det.trackId && d.cls === det.cls);
    if (match) {
      out.push({ det, box: lerpBox(match.box, det.box, k), pose: lerpPts(match.pose, det.pose, k), mask: lerpPts(match.mask, det.mask, k), opacity: 1, chip: true });
    } else {
      out.push({ det, box: det.box, pose: det.pose, mask: det.mask, opacity: clamp((t - curr.t) / 0.09, 0.25, 1), chip: true });
    }
  }
  return out;
}

export interface AnnotateInput {
  module: ModuleId;
  t: number;
  frames: ModuleFrames;
  zones: Zone[];
  settings: FeedSettings;
  classes: ActiveClass[];
  /** CSS pixels per scene unit; line widths and fonts are specified in CSS px. */
  scale: number;
  mini: boolean;
  heat?: { grid: Float32Array; cam: Camera };
  reducedMotion: boolean;
}

function statusColor(det: Detection): string {
  if (det.status === "alert") return COLORS.alert;
  if (det.status === "warn") return COLORS.warn;
  return det.color;
}

export function paintAnnotations(ctx: CanvasRenderingContext2D, o: AnnotateInput): void {
  const px = 1 / o.scale;
  const L = o.settings.layers;
  const hidden = new Set(o.classes.filter((c) => !c.visible).map((c) => c.spec.key));
  const dets = displayDetections(o.frames, o.t).filter((d) => !hidden.has(d.det.cls));

  if (o.heat && L.heat) paintHeat(ctx, o.heat.grid, o.heat.cam, o.t);
  if (L.zones) paintZones(ctx, o.zones, px, o.mini);

  if (L.tracks) {
    for (const d of dets) {
      if (!d.det.trail || d.det.trail.length < 2) continue;
      paintTrail(ctx, d.det.trail, { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h }, px, o.module === "patio");
    }
  }
  if (L.masks) {
    for (const d of dets) {
      if (!d.mask || d.mask.length < 3) continue;
      ctx.globalAlpha = d.opacity;
      polyPath(ctx, d.mask);
      ctx.fillStyle = hexAlpha(statusColor(d.det), 0.24);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(statusColor(d.det), 0.9);
      ctx.lineWidth = 1.2 * px;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (L.boxes) {
    for (const d of dets) paintBox(ctx, d, px, o.mini);
  }
  if (L.pose) {
    for (const d of dets) {
      if (!d.pose) continue;
      paintPose(ctx, d.pose, d.det.color, px, d.opacity);
    }
  }
  if (L.boxes && !o.mini) {
    // Chips are placed in confidence order and nudged clear of the ones
    // already placed, so a crowded frame stays readable.
    const chipSpecs = new Map(o.classes.map((c) => [c.spec.key, c.spec.chip !== false]));
    const perClass = new Map<string, number>();
    for (const d of dets) perClass.set(d.det.cls, (perClass.get(d.det.cls) ?? 0) + 1);
    const placed: Box[] = [];
    const ordered = dets.filter((d) => chipSpecs.get(d.det.cls) !== false).sort((a, b) => a.box.y - b.box.y);
    for (const d of ordered) {
      // Dense classes drop the class name: the colour already carries it, and
      // the identifier (a SKU, a plate) is the part worth reading.
      const compact = (perClass.get(d.det.cls) ?? 0) > 5;
      paintChip(ctx, d, px, L.ids, placed, compact);
    }
  }
}

function paintBox(ctx: CanvasRenderingContext2D, d: DisplayDetection, px: number, mini: boolean): void {
  const c = statusColor(d.det);
  const b = d.box;
  ctx.globalAlpha = d.opacity;
  if (d.det.status !== "ok") {
    ctx.fillStyle = hexAlpha(c, 0.08);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.strokeStyle = c;
  ctx.lineWidth = (mini ? 1 : 1.25) * px;
  if (d.det.status === "alert" && !mini) {
    ctx.save();
    ctx.shadowColor = hexAlpha(c, 0.45);
    ctx.shadowBlur = 8 * px;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  } else {
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // corner ticks give the box a little weight without a heavier line
  if (!mini) {
    const tick = Math.min(10 * px, b.w * 0.3, b.h * 0.3);
    ctx.lineWidth = 2.2 * px;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + tick);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + tick, b.y);
    ctx.moveTo(b.x + b.w - tick, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + tick);
    ctx.moveTo(b.x + b.w, b.y + b.h - tick);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w - tick, b.y + b.h);
    ctx.moveTo(b.x + tick, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h - tick);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function paintChip(ctx: CanvasRenderingContext2D, d: DisplayDetection, px: number, ids: boolean, placed: Box[], compact = false): void {
  const c = statusColor(d.det);
  const fs = (compact ? 10 : 11) * px;
  ctx.font = `500 ${fs}px ${FONTS.mono}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const parts: Array<{ text: string; color: string }> = [];
  if (compact && d.det.sub) parts.push({ text: d.det.sub, color: COLORS.text });
  else {
    parts.push({ text: d.det.label, color: COLORS.text });
    if (d.det.sub) parts.push({ text: d.det.sub, color: COLORS.muted });
  }
  parts.push({ text: d.det.conf.toFixed(2), color: c });
  if (ids && !compact && d.det.trackId >= 0) parts.push({ text: `#${String(d.det.trackId).padStart(4, "0")}`, color: COLORS.muted });
  const gap = (compact ? 5 : 7) * px;
  const padX = (compact ? 4 : 6) * px;
  let w = padX * 2;
  const widths = parts.map((p) => ctx.measureText(p.text).width);
  w += widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  const h = (compact ? 15 : 18) * px;
  let x = d.box.x;
  let y = d.box.y - h - 3 * px;
  if (y < 2 * px) y = d.box.y + 3 * px;
  if (x + w > SCENE_W - 2 * px) x = SCENE_W - w - 2 * px;
  if (x < 2 * px) x = 2 * px;
  // step the chip down until it clears the ones already drawn
  for (let attempt = 0; attempt < 6; attempt++) {
    const rect: Box = { x, y, w, h };
    const hit = placed.find((r) => overlaps(rect, r));
    if (!hit) break;
    y = hit.y + hit.h + 2 * px;
  }
  if (y + h > SCENE_H - 2 * px) y = SCENE_H - h - 2 * px;
  placed.push({ x, y, w, h });
  ctx.globalAlpha = d.opacity;
  ctx.fillStyle = COLORS.chipBg;
  roundRect(ctx, x, y, w, h, 3 * px);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(c, 0.55);
  ctx.lineWidth = 1 * px;
  ctx.stroke();
  // colour tab on the left edge
  ctx.fillStyle = c;
  ctx.fillRect(x, y + 3 * px, 2 * px, h - 6 * px);
  let cx = x + padX + 1 * px;
  parts.forEach((p, i) => {
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, cx, y + h / 2 + 0.5 * px);
    cx += (widths[i] ?? 0) + gap;
  });
  ctx.globalAlpha = 1;
}

function paintPose(ctx: CanvasRenderingContext2D, kp: Vec2[], color: string, px: number, opacity: number): void {
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = hexAlpha(color, 0.9);
  ctx.lineWidth = 1.4 * px;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const p = kp[a];
    const q = kp[b];
    if (!p || !q) continue;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  for (const p of kp) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintTrail(ctx: CanvasRenderingContext2D, trail: Vec2[], head: Vec2, px: number, topDown: boolean): void {
  const pts = [...trail, topDown ? head : head];
  const n = pts.length;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const f = i / n;
    ctx.strokeStyle = hexAlpha(COLORS.track, 0.08 + f * 0.7);
    ctx.lineWidth = (0.8 + f * 1.4) * px;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.track;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.2 * px, 0, Math.PI * 2);
  ctx.fill();
}

function zoneStyle(z: Zone): { stroke: string; fill: string; dash: number[] } {
  switch (z.kind) {
    case "restricted":
      return { stroke: hexAlpha(COLORS.alert, 0.8), fill: hexAlpha(COLORS.alert, 0.07), dash: [6, 4] };
    case "pedestrian":
      return { stroke: hexAlpha(COLORS.warn, 0.75), fill: hexAlpha(COLORS.warn, 0.06), dash: [6, 4] };
    case "line":
      return { stroke: hexAlpha(COLORS.warn, 0.9), fill: "transparent", dash: [] };
    case "dock":
      return z.label.includes("ocupada")
        ? { stroke: hexAlpha(COLORS.ok, 0.75), fill: hexAlpha(COLORS.ok, 0.14), dash: [] }
        : { stroke: "rgba(232,236,244,0.22)", fill: "rgba(232,236,244,0.03)", dash: [] };
    case "lane":
      return { stroke: "rgba(232,236,244,0.22)", fill: "rgba(232,236,244,0.02)", dash: [3, 5] };
    default:
      return { stroke: "rgba(232,236,244,0.4)", fill: "rgba(232,236,244,0.04)", dash: [5, 5] };
  }
}

function paintZones(ctx: CanvasRenderingContext2D, zones: Zone[], px: number, mini: boolean): void {
  for (const z of zones) {
    const s = zoneStyle(z);
    if (z.kind === "line") {
      const [a, b] = z.points as [Vec2, Vec2];
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // end ticks
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 5 * px;
      const ny = (dx / len) * 5 * px;
      ctx.beginPath();
      ctx.moveTo(a.x - nx, a.y - ny);
      ctx.lineTo(a.x + nx, a.y + ny);
      ctx.moveTo(b.x - nx, b.y - ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
    } else {
      polyPath(ctx, z.points);
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.setLineDash(s.dash.map((v) => v * px));
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = 1 * px;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Dock bays already carry a painted number on the apron; a chip per bay
    // would just stack eight labels along the top edge.
    if (mini || z.kind === "dock") continue;
    // label at the top-most vertex
    let top = z.points[0] as Vec2;
    for (const p of z.points) if (p.y < top.y || (p.y === top.y && p.x < top.x)) top = p;
    const fs = 10 * px;
    ctx.font = `500 ${fs}px ${FONTS.mono}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const text = z.label.toUpperCase();
    const w = ctx.measureText(text).width + 10 * px;
    const h = 15 * px;
    const x = top.x;
    const y = top.y - h - 2 * px;
    ctx.fillStyle = COLORS.chipBg;
    roundRect(ctx, x, Math.max(2 * px, y), w, h, 2 * px);
    ctx.fill();
    ctx.fillStyle = z.kind === "restricted" ? COLORS.alert : z.kind === "pedestrian" || z.kind === "line" ? COLORS.warn : COLORS.muted;
    ctx.fillText(text, x + 5 * px, Math.max(2 * px, y) + h / 2 + 0.5 * px);
  }
}

function heatColor(v: number): string {
  // cyan → amber → red; alpha grows with dwell so light traffic stays quiet
  if (v < 0.5) {
    const k = v / 0.5;
    return `rgba(${Math.round(76 + (245 - 76) * k)},${Math.round(201 + (165 - 201) * k)},${Math.round(240 + (36 - 240) * k)},${0.1 + v * 0.4})`;
  }
  const k = (v - 0.5) / 0.5;
  return `rgba(${Math.round(245 + (229 - 245) * k)},${Math.round(165 + (72 - 165) * k)},${Math.round(36 + (77 - 36) * k)},${0.22 + k * 0.2})`;
}

/**
 * The heat grid sits on a fixed floor under a fixed camera, so every cell
 * projects to the same screen quad for the life of the page. Project once.
 */
let heatQuads: Vec2[][] | null = null;

function heatGeometry(cam: Camera): Vec2[][] {
  if (heatQuads) return heatQuads;
  const cellW = (FLOOR.x1 - FLOOR.x0) / HEAT_COLS;
  const cellH = (FLOOR.z1 - FLOOR.z0) / HEAT_ROWS;
  const quads: Vec2[][] = [];
  for (let r = 0; r < HEAT_ROWS; r++) {
    for (let c = 0; c < HEAT_COLS; c++) {
      const x0 = FLOOR.x0 + c * cellW;
      const z0 = FLOOR.z0 + r * cellH;
      quads.push([
        project(cam, x0, 0.01, z0),
        project(cam, x0 + cellW, 0.01, z0),
        project(cam, x0 + cellW, 0.01, z0 + cellH),
        project(cam, x0, 0.01, z0 + cellH),
      ]);
    }
  }
  heatQuads = quads;
  return quads;
}

/**
 * The grid is coarse (0.5 m cells), so drawing it directly gives a chequerboard.
 * It is rasterised into an offscreen buffer a few times a second and blitted
 * through a blur, which reads as accumulated dwell rather than floor tiles.
 */
let heatBuf: HTMLCanvasElement | null = null;
let heatBufAt = -1;

function paintHeat(ctx: CanvasRenderingContext2D, grid: Float32Array, cam: Camera, t: number): void {
  let max = 0;
  for (let i = 0; i < grid.length; i++) if ((grid[i] ?? 0) > max) max = grid[i] ?? 0;
  if (max <= 0) return;
  if (!heatBuf) {
    heatBuf = document.createElement("canvas");
    heatBuf.width = SCENE_W;
    heatBuf.height = SCENE_H;
  }
  if (Math.abs(t - heatBufAt) > 0.4) {
    heatBufAt = t;
    const bc = heatBuf.getContext("2d");
    if (bc) {
      bc.clearRect(0, 0, SCENE_W, SCENE_H);
      const quads = heatGeometry(cam);
      // A square-root ramp against a clamped reference: without it a single
      // hotspot flattens the rest of the floor to nothing.
      const norm = Math.min(45, Math.max(9, max));
      for (let i = quads.length - 1; i >= 0; i--) {
        const raw = (grid[i] ?? 0) / norm;
        const v = Math.sqrt(Math.max(0, Math.min(1, raw)));
        if (v < 0.06) continue;
        const q = quads[i];
        if (!q) continue;
        polyPath(bc, q);
        bc.fillStyle = heatColor(Math.min(1, v));
        bc.fill();
      }
    }
  }
  ctx.save();
  ctx.filter = "blur(9px)";
  ctx.globalAlpha = 0.85;
  ctx.drawImage(heatBuf, 0, 0, SCENE_W, SCENE_H);
  ctx.restore();
}

/** Camera id + simulated clock burned into the frame, like real CCTV. */
export function paintBurnIn(ctx: CanvasRenderingContext2D, label: string, clock: string, px: number, mini: boolean, playing: boolean): void {
  const fs = (mini ? 9 : 11) * px;
  ctx.font = `500 ${fs}px ${FONTS.mono}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const text = mini ? label : `${label}   ${clock}`;
  const w = ctx.measureText(text).width + 12 * px;
  const h = (mini ? 14 : 18) * px;
  const x = 8 * px;
  const y = SCENE_H - h - 8 * px;
  ctx.fillStyle = "rgba(6,8,15,0.6)";
  roundRect(ctx, x, y, w, h, 2 * px);
  ctx.fill();
  ctx.fillStyle = "rgba(232,236,244,0.85)";
  ctx.fillText(text, x + 6 * px, y + h / 2 + 0.5 * px);
  if (!mini) {
    ctx.textAlign = "right";
    const st = playing ? "LIVE" : "PAUSA";
    ctx.fillStyle = playing ? COLORS.alert : COLORS.muted;
    ctx.beginPath();
    ctx.arc(SCENE_W - 14 * px, y + h / 2, 3 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(232,236,244,0.85)";
    ctx.fillText(st, SCENE_W - 22 * px, y + h / 2 + 0.5 * px);
  }
}
