import { CLASS_PALETTE, type ClassSpec } from "@/lib/sim/classes";
import type { Box, Detection, DetectionFrame } from "@/lib/sim/types";
import type { GroundingInput, InferenceProvider, ProviderInfo } from "./provider";

/**
 * Stub for a real backend built on nvidia/LocateAnything-3B.
 *
 * NOT IMPLEMENTED. The class exists so the integration surface is explicit.
 * Wiring it up would look like this:
 *
 * 1. Serve the model behind an HTTP endpoint (a Python worker using the
 *    `transformers` remote code from the model card, `generation_mode="hybrid"`,
 *    BF16 on an Ampere+ GPU). One request = one frame + one prompt.
 * 2. Encode the feed canvas (`input.frame`) as JPEG and send it with the
 *    prompt template the model expects for detection:
 *       "Locate all instances matching {classes joined by ', '}"
 *    Every class in `input.classes` goes in the same prompt: the model decodes
 *    all boxes for all phrases in one parallel pass, which is the point of PBD.
 * 3. Parse the reply. Boxes come back as `<box><x1><y1><x2><y2></box>` blocks
 *    with coordinates normalised to [0, 1000]; scale them to scene pixels with
 *    `denormalize`. Each block is preceded by the phrase it belongs to, which
 *    maps back to a `ClassSpec` by label.
 * 4. Track ids are not produced by the model. Run a lightweight tracker
 *    (IoU / Kalman) over consecutive frames to assign stable ids.
 * 5. Masks and keypoints are not part of the detection task; a segmentation
 *    head or a second prompt (pointing task) would be needed for those layers.
 *
 * Latency reported by the runtime replaces the simulated telemetry.
 */
export class LocateAnythingProvider implements InferenceProvider {
  readonly info: ProviderInfo = {
    id: "locate-anything-3b",
    label: "LocateAnything-3B",
    simulated: false,
    runtime: "no conectado",
  };

  constructor(private readonly endpoint: string) {}

  ground(input: GroundingInput): Promise<DetectionFrame> {
    void input;
    void this.endpoint;
    return Promise.reject(new Error("LocateAnythingProvider is a stub; no backend is connected."));
  }
}

/** Model output: one grounded box in [0, 1000] normalised coordinates. */
export interface RawBox {
  phrase: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score?: number;
}

export function denormalize(raw: RawBox, sceneW: number, sceneH: number): Box {
  return {
    x: (raw.x1 / 1000) * sceneW,
    y: (raw.y1 / 1000) * sceneH,
    w: ((raw.x2 - raw.x1) / 1000) * sceneW,
    h: ((raw.y2 - raw.y1) / 1000) * sceneH,
  };
}

/** Maps parsed boxes onto the app's detection type; kept here so the shape is documented. */
export function toDetections(raw: RawBox[], classes: ClassSpec[], sceneW: number, sceneH: number): Detection[] {
  const out: Detection[] = [];
  raw.forEach((r, i) => {
    const cls = classes.find((c) => c.label === r.phrase);
    if (!cls) return;
    out.push({
      trackId: i,
      entityId: -1,
      cls: cls.key,
      label: cls.label,
      conf: r.score ?? 0.5,
      box: denormalize(r, sceneW, sceneH),
      status: "ok",
      color: CLASS_PALETTE[cls.colorIndex % CLASS_PALETTE.length] ?? "#ffffff",
    });
  });
  return out;
}
