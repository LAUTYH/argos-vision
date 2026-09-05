/**
 * Offline annotation of the real camera clips.
 *
 * Runs an open-vocabulary detector (OWL-ViT) over sampled frames of each clip
 * and writes the boxes to JSON. Nothing about this runs in the browser: the app
 * ships the resulting track file, so the overlay is a real detection result
 * without a model download on the client.
 *
 *   pnpm annotate:feeds            # all clips
 *   pnpm annotate:feeds patio      # one clip
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const OUT_DIR = "public/feeds";
const TMP = ".annotate-frames";
/** Frames per second sampled from the clip; the overlay interpolates between them. */
const SAMPLE_FPS = 5;
const SCORE_FLOOR = 0.1;
const NMS_IOU = 0.45;
const TRACK_IOU = 0.3;
const TRACK_MAX_GAP = 3;

interface ClipSpec {
  id: string;
  /** Phrases handed to the detector, in the model's own English prompt space. */
  vocab: Array<{ phrase: string; cls: string; min: number }>;
  /**
   * Overlap allowed before two boxes of the same class are merged. Trailers
   * parked side by side in an aerial shot legitimately overlap, so the yard
   * needs a looser value than a conveyor seen from the side.
   */
  nms?: number;
}

/**
 * Thresholds are per phrase and were calibrated against a frame of each clip:
 * OWL-ViT scores are not comparable across prompts, so one global cut-off
 * either floods the aerial shot or empties the close one.
 */
const CLIPS: ClipSpec[] = [
  {
    id: "patio",
    nms: 0.68,
    vocab: [
      { phrase: "a semi truck trailer seen from above", cls: "camion", min: 0.088 },
      { phrase: "a car", cls: "auto", min: 0.1 },
    ],
  },
  {
    id: "recepcion",
    vocab: [
      { phrase: "a cardboard box", cls: "caja", min: 0.16 },
      { phrase: "a plastic wrapped parcel", cls: "bulto", min: 0.15 },
    ],
  },
  {
    id: "flujo",
    vocab: [
      { phrase: "a person", cls: "persona", min: 0.2 },
      { phrase: "a cardboard box", cls: "caja", min: 0.2 },
      { phrase: "a wooden pallet", cls: "pallet", min: 0.1 },
    ],
  },
];

interface RawBox {
  cls: string;
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TrackedBox extends RawBox {
  id: number;
}

interface FrameOut {
  t: number;
  d: Array<[number, string, number, number, number, number, number]>;
}

function iou(a: RawBox, b: RawBox): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy non-maximum suppression, per class. */
function nms(boxes: RawBox[], maxIou: number): RawBox[] {
  const out: RawBox[] = [];
  for (const cls of new Set(boxes.map((b) => b.cls))) {
    const group = boxes.filter((b) => b.cls === cls).sort((a, b) => b.score - a.score);
    const kept: RawBox[] = [];
    for (const b of group) {
      if (kept.some((k) => iou(k, b) > maxIou)) continue;
      kept.push(b);
    }
    out.push(...kept);
  }
  return out;
}

/** IoU tracker: hands each detection a stable id across frames. */
class Tracker {
  private next = 1;
  private live: Array<{ id: number; box: RawBox; miss: number }> = [];

  step(boxes: RawBox[]): TrackedBox[] {
    const out: TrackedBox[] = [];
    const used = new Set<number>();
    for (const b of boxes) {
      let best = -1;
      let bestScore = TRACK_IOU;
      this.live.forEach((t, i) => {
        if (used.has(i) || t.box.cls !== b.cls) return;
        const s = iou(t.box, b);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best >= 0) {
        const t = this.live[best];
        if (t) {
          used.add(best);
          t.box = b;
          t.miss = 0;
          out.push({ ...b, id: t.id });
          continue;
        }
      }
      const id = this.next++;
      this.live.push({ id, box: b, miss: 0 });
      used.add(this.live.length - 1);
      out.push({ ...b, id });
    }
    this.live = this.live.filter((t, i) => (used.has(i) ? true : ++t.miss <= TRACK_MAX_GAP));
    return out;
  }
}

async function annotate(spec: ClipSpec): Promise<void> {
  const src = join(OUT_DIR, `${spec.id}.mp4`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `fps=${SAMPLE_FPS}`, join(TMP, "f%04d.png")]);
  const files = readdirSync(TMP).filter((f) => f.endsWith(".png")).sort();

  const detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { dtype: "fp32" });
  const phrases = spec.vocab.map((v) => v.phrase);
  const clsOf = new Map(spec.vocab.map((v) => [v.phrase, v.cls]));
  const minOf = new Map(spec.vocab.map((v) => [v.phrase, v.min]));

  const tracker = new Tracker();
  const frames: FrameOut[] = [];
  const t0 = Date.now();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const raw = await detector(join(TMP, file), phrases, { threshold: SCORE_FLOOR, percentage: true });
    const boxes: RawBox[] = [];
    for (const r of raw as Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>) {
      const min = minOf.get(r.label) ?? 1;
      if (r.score < min) continue;
      const cls = clsOf.get(r.label);
      if (!cls) continue;
      boxes.push({ cls, score: r.score, x: r.box.xmin, y: r.box.ymin, w: r.box.xmax - r.box.xmin, h: r.box.ymax - r.box.ymin });
    }
    const tracked = tracker.step(nms(boxes, spec.nms ?? NMS_IOU));
    frames.push({
      t: +(i / SAMPLE_FPS).toFixed(3),
      d: tracked.map((b) => [b.id, b.cls, +b.x.toFixed(4), +b.y.toFixed(4), +b.w.toFixed(4), +b.h.toFixed(4), +b.score.toFixed(3)]),
    });
    if (i % 20 === 0) process.stderr.write(`  ${spec.id} ${i + 1}/${files.length}\r`);
  }
  rmSync(TMP, { recursive: true, force: true });

  const total = frames.reduce((a, f) => a + f.d.length, 0);
  const out = {
    clip: `${spec.id}.mp4`,
    model: "Xenova/owlvit-base-patch32",
    task: "zero-shot-object-detection",
    sampleFps: SAMPLE_FPS,
    vocab: spec.vocab.map((v) => ({ cls: v.cls, phrase: v.phrase })),
    note: "Cajas producidas fuera de línea por OWL-ViT sobre este clip. Coordenadas normalizadas 0..1.",
    frames,
  };
  writeFileSync(join(OUT_DIR, `${spec.id}.tracks.json`), JSON.stringify(out));
  console.warn(
    `${spec.id}: ${files.length} frames · ${total} cajas · ${(total / files.length).toFixed(1)} por frame · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
  );
}

async function main(): Promise<void> {
  const only = process.argv[2];
  for (const spec of CLIPS) {
    if (only && spec.id !== only) continue;
    await annotate(spec);
  }
}

void main();
