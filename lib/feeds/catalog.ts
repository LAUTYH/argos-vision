import type { ModuleId } from "@/lib/sim/types";

/**
 * Modules backed by real camera footage instead of a procedural scene.
 *
 * A module only appears here when a clip genuinely matches what the module is
 * about. The other three stay procedural on purpose:
 *
 * - `seguridad` needs missing-PPE events. The available warehouse footage shows
 *   identifiable people without helmets, and labelling real workers as safety
 *   violators — with invented names and roles — is not something this demo does.
 * - `inspeccion` needs blade defects to segment. Stock turbine footage has none.
 * - `documentos` needs the remito whose numbers the rest of the app cross-checks.
 */
export interface RealFeed {
  module: ModuleId;
  clip: string;
  tracks: string;
  /** Where the footage came from, shown in the UI. */
  source: string;
  credit: string;
  /** Seconds; the clip loops. */
  duration: number;
  /** Frames per second at which the clip was annotated offline. */
  sampleFps: number;
}

export const REAL_FEEDS: Partial<Record<ModuleId, RealFeed>> = {
  patio: {
    module: "patio",
    clip: "/feeds/patio.mp4",
    tracks: "/feeds/patio.tracks.json",
    source: "Pexels · Alex Kad · dron sobre patio de camiones",
    credit: "pexels.com/video/5171156",
    duration: 16,
    sampleFps: 5,
  },
  recepcion: {
    module: "recepcion",
    clip: "/feeds/recepcion.mp4",
    tracks: "/feeds/recepcion.tracks.json",
    source: "Pexels · descarga de bultos en cinta",
    credit: "pexels.com/video/5370836",
    duration: 17,
    sampleFps: 5,
  },
  flujo: {
    module: "flujo",
    clip: "/feeds/flujo.mp4",
    tracks: "/feeds/flujo.tracks.json",
    source: "Pexels · Tiger Lily · nave de picking",
    credit: "pexels.com/video/4281239",
    duration: 9,
    sampleFps: 5,
  },
};

export function realFeedFor(module: ModuleId): RealFeed | undefined {
  return REAL_FEEDS[module];
}

export function hasRealFeed(module: ModuleId): boolean {
  return REAL_FEEDS[module] !== undefined;
}
