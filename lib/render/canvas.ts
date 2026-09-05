import { SCENE_H, SCENE_W } from "@/lib/sim/camera";

/** Fonts used inside canvases; set once from the app shell (next/font family names). */
export const FONTS = {
  mono: "ui-monospace, Menlo, monospace",
  sans: "system-ui, sans-serif",
};

export function setCanvasFonts(mono: string, sans: string): void {
  FONTS.mono = mono;
  FONTS.sans = sans;
}

export interface Surface {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels per scene unit. */
  scale: number;
  cssW: number;
  cssH: number;
}

/**
 * Sizes the canvas for the device pixel ratio and applies a transform so all
 * drawing happens in scene units (1280 × 720) regardless of the CSS size.
 */
export function prepareSurface(canvas: HTMLCanvasElement, cssW: number, cssH: number, dprCap = 2): Surface | null {
  if (!(cssW > 2) || !(cssH > 2)) return null;
  const dpr = Math.min(dprCap, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const scale = Math.min(cssW / SCENE_W, cssH / SCENE_H);
  const ox = (cssW - SCENE_W * scale) / 2;
  const oy = (cssH - SCENE_H * scale) / 2;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
  return { ctx, scale, cssW, cssH };
}

/** Offscreen canvases for static layers, keyed by an arbitrary string. */
const layerCache = new Map<string, HTMLCanvasElement>();

export function staticLayer(key: string, dpr: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const k = `${key}@${dpr}`;
  const hit = layerCache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = Math.round(SCENE_W * dpr);
  c.height = Math.round(SCENE_H * dpr);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx);
  }
  layerCache.set(k, c);
  if (layerCache.size > 24) {
    const first = layerCache.keys().next().value;
    if (first !== undefined) layerCache.delete(first);
  }
  return c;
}

/** Draws a cached layer covering the scene. */
export function blitLayer(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement): void {
  ctx.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, SCENE_W, SCENE_H);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function polyPath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Cached sensor-noise tile so the "video" never looks perfectly clean. */
let noiseTile: HTMLCanvasElement | null = null;

export function getNoiseTile(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    let s = 0x2f6e2b1;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = 110 + (s >>> 24) * 0.55;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  noiseTile = c;
  return c;
}
