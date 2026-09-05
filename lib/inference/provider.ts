import type { ClassSpec } from "@/lib/sim/classes";
import type { DetectionFrame, ModuleId, Observable } from "@/lib/sim/types";

/**
 * Everything the UI knows about "inference" goes through this interface.
 *
 * The active implementation is `SimulatedProvider`: detections are derived
 * from the simulated world, never from pixels. `LocateAnythingProvider` is a
 * typed stub documenting how a real model would plug in. Nothing else in the
 * app should know which one is running.
 */
export interface GroundingInput {
  module: ModuleId;
  seed: number;
  tick: number;
  /** Simulation time of the frame, seconds. */
  t: number;
  /** Latency the runtime reports for this frame, milliseconds. */
  latencyMs: number;
  /** Natural-language classes to ground, e.g. "caja dañada". */
  classes: ClassSpec[];
  /** Classes that were just added and whose first result has not arrived. */
  pending: Set<string>;
  /**
   * What the simulated camera can see. A real provider ignores this and reads
   * `frame` instead.
   */
  observables: Observable[];
  /** Rendered frame pixels; only a real provider needs them. */
  frame?: HTMLCanvasElement | ImageBitmap;
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** True when results come from the simulation rather than a model. */
  simulated: boolean;
  runtime: string;
}

export interface InferenceProvider {
  readonly info: ProviderInfo;
  /**
   * Grounds the given classes on one frame. A simulated provider answers
   * synchronously; a network-backed one returns a promise. The engine handles
   * both so swapping providers never touches the UI.
   */
  ground(input: GroundingInput): DetectionFrame | Promise<DetectionFrame>;
}
