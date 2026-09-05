import type { Box, Vec2 } from "./types";

/** Logical scene size shared by every feed (16:9). */
export const SCENE_W = 1280;
export const SCENE_H = 720;

/**
 * Pinhole camera for the perspective feeds. Sits at (0, height, 0) looking
 * along +Z, pitched down by `pitch` radians. World: X lateral (m), Y up (m),
 * Z depth (m). Screen: scene pixels.
 */
export interface Camera {
  height: number;
  pitch: number;
  focal: number;
  cx: number;
  cy: number;
}

export function project(cam: Camera, x: number, y: number, z: number): Vec2 {
  const dy = y - cam.height;
  const sin = Math.sin(cam.pitch);
  const cos = Math.cos(cam.pitch);
  const zc = -dy * sin + z * cos;
  const yc = dy * cos + z * sin;
  const safe = Math.max(zc, 0.05);
  return { x: cam.cx + (cam.focal * x) / safe, y: cam.cy - (cam.focal * yc) / safe };
}

/** Screen-space bounding box of a world-space axis-aligned box. */
export function projectBox(
  cam: Camera,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  yaw = 0,
): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = 0; i < 8; i++) {
    const lx = (i & 1 ? 0.5 : -0.5) * w;
    const lz = (i & 2 ? 0.5 : -0.5) * d;
    const ly = i & 4 ? h : 0;
    const wx = x + lx * c - lz * s;
    const wz = z + lx * s + lz * c;
    const p = project(cam, wx, y + ly, wz);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Screen scale (pixels per metre) at the given depth on the floor plane. */
export function scaleAt(cam: Camera, z: number): number {
  const a = project(cam, 0, 0, z);
  const b = project(cam, 1, 0, z);
  return b.x - a.x;
}

export function polyBox(points: Vec2[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function boxIntersection(a: Box, b: Box): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

export function clampBox(b: Box, w = SCENE_W, h = SCENE_H): Box {
  const x0 = Math.max(0, b.x);
  const y0 = Math.max(0, b.y);
  const x1 = Math.min(w, b.x + b.w);
  const y1 = Math.min(h, b.y + b.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
