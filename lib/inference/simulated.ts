import { detectFrame } from "@/lib/sim/detector";
import type { DetectionFrame } from "@/lib/sim/types";
import type { GroundingInput, InferenceProvider, ProviderInfo } from "./provider";

/**
 * The provider this demo runs on. It turns the simulated world's observables
 * into detections with realistic imperfections (see lib/sim/detector.ts).
 * It never looks at pixels and does not execute any model.
 */
export class SimulatedProvider implements InferenceProvider {
  readonly info: ProviderInfo = {
    id: "simulated",
    label: "Simulación determinista",
    simulated: true,
    runtime: "mulberry32 · sin modelo",
  };

  ground(input: GroundingInput): DetectionFrame {
    return detectFrame({
      seed: input.seed,
      module: input.module,
      tick: input.tick,
      t: input.t,
      latencyMs: input.latencyMs,
      observables: input.observables,
      classes: input.classes,
      pending: input.pending,
    });
  }
}
