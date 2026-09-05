import { classColor, classesFor, type ClassSpec } from "@/lib/sim/classes";
import { SCENE_H, SCENE_W } from "@/lib/sim/camera";
import type { Detection, DetectionFrame, ModuleId } from "@/lib/sim/types";
import { clipTime, frameAt, loadedTracks, nextFrameAt, type TrackBox, type TrackFile } from "@/lib/feeds/tracks";
import type { GroundingInput, InferenceProvider, ProviderInfo } from "./provider";

/**
 * Serves detections that a real model produced offline over the real clip.
 *
 * `scripts/annotate-feeds.ts` runs OWL-ViT over sampled frames and writes the
 * boxes to JSON; this reads them back at the clip's current position. The boxes
 * are a genuine detection result — nothing here invents a box — but no model
 * runs in the browser, which is why the console still says the run is simulated
 * for everything except the boxes themselves.
 */
export class PrecomputedProvider implements InferenceProvider {
  readonly info: ProviderInfo = {
    id: "precomputed-owlvit",
    label: "OWL-ViT · anotación offline",
    simulated: false,
    runtime: "cajas precomputadas sobre el clip",
  };

  ground(input: GroundingInput): DetectionFrame {
    const file = loadedTracks(input.module);
    if (!file) return { tick: input.tick, t: input.t, latencyMs: input.latencyMs, detections: [] };
    const t = clipTime(input.module, input.t);
    const a = frameAt(file, t);
    const b = nextFrameAt(file, t);
    if (!a) return { tick: input.tick, t: input.t, latencyMs: input.latencyMs, detections: [] };

    const k = b && b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const nextById = new Map<number, TrackBox>();
    for (const box of b?.d ?? []) nextById.set(box[0], box);

    const wanted = new Map<string, ClassSpec>();
    for (const spec of input.classes) {
      if (input.pending.has(spec.key)) continue;
      wanted.set(spec.key, spec);
    }

    const detections: Detection[] = [];
    for (const box of a.d) {
      const [id, cls, x, y, w, h, score] = box;
      const spec = wanted.get(cls);
      if (!spec) continue;
      const nb = nextById.get(id);
      const lerp = (p: number, q: number): number => p + (q - p) * k;
      const bx = nb ? lerp(x, nb[2]) : x;
      const by = nb ? lerp(y, nb[3]) : y;
      const bw = nb ? lerp(w, nb[4]) : w;
      const bh = nb ? lerp(h, nb[5]) : h;
      detections.push({
        trackId: id,
        entityId: id,
        cls: spec.key,
        label: spec.label,
        conf: score,
        box: { x: bx * SCENE_W, y: by * SCENE_H, w: bw * SCENE_W, h: bh * SCENE_H },
        status: "ok",
        color: classColor(spec),
        sub: undefined,
      });
    }
    return { tick: input.tick, t: input.t, latencyMs: input.latencyMs, detections };
  }
}

/** Classes a module can actually ground on its real clip, from the track file's vocabulary. */
export function realVocabulary(module: ModuleId): ClassSpec[] {
  const file: TrackFile | undefined = loadedTracks(module);
  if (!file) return [];
  const keys = new Set(file.vocab.map((v) => v.cls));
  return classesFor(module).filter((c) => keys.has(c.key));
}
