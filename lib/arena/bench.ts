import { hashRng } from "@/lib/sim/rng";

/**
 * Model bench data. Throughput and accuracy come from the LocateAnything
 * paper (arXiv 2605.27365, Table 1 and Table 12): single H100, batch 1,
 * BF16, COCO images with the short side at 840 px. Nothing is measured here.
 */
export interface BenchModel {
  id: string;
  name: string;
  params: string;
  /** Boxes decoded per second. */
  bps: number;
  /** Boxes emitted per decode step (parallel block decoding vs. token by token). */
  parallel: number;
  color: string;
  coco: { f1_50: number | null; f1_95: number | null; f1_mIoU: number | null };
  lvis: { f1_50: number | null; f1_95: number | null; f1_mIoU: number | null };
  decoding: string;
  note: string;
}

export const BENCH_MODELS: BenchModel[] = [
  {
    id: "locate-anything",
    name: "LocateAnything-3B",
    params: "3B · MoonViT-SO-400M + Qwen2.5-3B",
    bps: 12.7,
    parallel: 4,
    color: "#76B900",
    coco: { f1_50: 70.1, f1_95: 19.3, f1_mIoU: 54.7 },
    lvis: { f1_50: 62.3, f1_95: 31.1, f1_mIoU: 50.7 },
    decoding: "Parallel Box Decoding · híbrido",
    note: "Cada caja es un bloque atómico de 6 tokens decodificado en un paso; cae a autoregresivo si la confianza de coordenada es < 0.7.",
  },
  {
    id: "rex-omni",
    name: "Rex-Omni-3B",
    params: "3B",
    bps: 5.0,
    parallel: 1,
    color: "#C792EA",
    coco: { f1_50: 72.0, f1_95: 15.9, f1_mIoU: 52.9 },
    lvis: { f1_50: 64.3, f1_95: 20.7, f1_mIoU: 46.9 },
    decoding: "Autoregresivo · coordenadas cuantizadas",
    note: "Fuerte en IoU 0.5; pierde precisión fina (F1 a IoU 0.95).",
  },
  {
    id: "qwen3-vl",
    name: "Qwen3-VL-4B",
    params: "4B (8B: 1.0 boxes/s · COCO F1@0.5 62.8)",
    bps: 1.1,
    parallel: 1,
    color: "#6FA8FF",
    coco: { f1_50: null, f1_95: null, f1_mIoU: null },
    lvis: { f1_50: null, f1_95: null, f1_mIoU: null },
    decoding: "Autoregresivo · token por token",
    note: "VLM generalista: cada coordenada es un token secuencial, ~10× más lento que PBD.",
  },
];

export const LA_MODES = [
  { mode: "fast", label: "Fast (MTP)", bps: 15.3 },
  { mode: "hybrid", label: "Hybrid (default)", bps: 12.7 },
  { mode: "slow", label: "Slow (NTP)", bps: 4.3 },
];

export const OTHER_BENCHMARKS = [
  { name: "Dense200 · F1@mIoU", la: "58.7", rex: "58.3" },
  { name: "VisDrone · F1@mIoU", la: "39.9", rex: "35.8" },
  { name: "ScreenSpot-Pro · acc. (GUI)", la: "60.3", rex: "—" },
  { name: "DocLayNet · F1@mIoU (layout)", la: "76.8", rex: "—" },
  { name: "RefCOCOg test · F1@mIoU", la: "77.6", rex: "—" },
];

export interface BenchBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  tone: number;
}

/** A dense synthetic pallet yard (top-down) with a deterministic set of ground-truth boxes. */
export function benchScene(seed: number): BenchBox[] {
  const r = hashRng(seed, "bench");
  const boxes: BenchBox[] = [];
  const labels = ["caja", "caja", "caja", "pallet", "bidón"];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      if (r.chance(0.08)) continue;
      const label = r.pick(labels);
      const w = label === "pallet" ? r.float(70, 84) : label === "bidón" ? r.float(30, 36) : r.float(40, 62);
      const h = label === "pallet" ? r.float(58, 70) : label === "bidón" ? r.float(30, 36) : r.float(34, 52);
      boxes.push({
        x: 40 + col * 100 + r.float(-10, 10) + (80 - w) / 2,
        y: 30 + row * 78 + r.float(-8, 8) + (66 - h) / 2,
        w,
        h,
        label,
        tone: r.next(),
      });
    }
  }
  return boxes;
}

export const BENCH_W = 860;
export const BENCH_H = 500;
