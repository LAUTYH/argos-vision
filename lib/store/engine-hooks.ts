"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getEngine, type Engine } from "@/lib/sim/engine";

const engineRef = { current: null as Engine | null };

export function useEngine(): Engine {
  if (!engineRef.current) {
    engineRef.current = getEngine();
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { argos?: Engine }).argos = engineRef.current;
    }
  }
  return engineRef.current;
}

/** Re-renders every animation frame. Use sparingly (clock, scrub bar). */
export function useEngineFrame(): number {
  const e = useEngine();
  return useSyncExternalStore(e.subscribeFrame, () => e.frameVersion, () => 0);
}

/** Re-renders about four times per second. KPIs, tables, event lists. */
export function useEngineSlow(): number {
  const e = useEngine();
  return useSyncExternalStore(e.subscribeSlow, () => e.slowVersion, () => 0);
}

/** Re-renders when playback or feed settings change. */
export function useEngineUi(): number {
  const e = useEngine();
  return useSyncExternalStore(e.subscribeUi, () => e.uiVersion, () => 0);
}

/**
 * Drives the engine clock. Mounted once in the app shell; pauses while the
 * tab is hidden so a recording never skips ahead.
 */
export function useEngineLoop(): void {
  const e = useEngine();
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      e.advance(dt);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [e]);
}
