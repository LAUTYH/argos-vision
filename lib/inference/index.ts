import { SimulatedProvider } from "./simulated";
import type { InferenceProvider } from "./provider";

export type { GroundingInput, InferenceProvider, ProviderInfo } from "./provider";
export { SimulatedProvider } from "./simulated";
export { LocateAnythingProvider } from "./locate-anything";

/** The provider the app runs with. Swap the implementation here to connect a model. */
export const activeProvider: InferenceProvider = new SimulatedProvider();
