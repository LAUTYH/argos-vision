"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { renderFeed } from "@/lib/render/feed";
import type { ModuleId } from "@/lib/sim/types";
import { useEngine } from "@/lib/store/engine-hooks";
import { cn } from "@/lib/utils";

/** Mini previews do not need 60 fps; six of them at full rate is pure waste. */
const MINI_FPS = 15;

/**
 * One feed. Owns its own requestAnimationFrame loop that reads the engine
 * directly, and stops drawing while off-screen or when the tab is hidden.
 */
export function FeedCanvas({ module, mini = false, className }: { module: ModuleId; mini?: boolean; className?: string }) {
  const engine = useEngine();
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;
    let visible = true;
    let size = { w: wrap.clientWidth, h: wrap.clientHeight };
    let lastFrame = -1;
    let lastPaint = 0;
    const minInterval = mini ? 1000 / MINI_FPS : 0;

    const draw = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const stale = engine.frameVersion !== lastFrame;
      if (stale && now - lastPaint >= minInterval) {
        lastFrame = engine.frameVersion;
        lastPaint = now;
        renderFeed({ canvas, module, engine, cssW: size.w, cssH: size.h, mini, reducedMotion: reduced });
      }
      raf = requestAnimationFrame(draw);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    // Development affordance: a browser tab in a background window never
    // fires requestAnimationFrame, so automated review has no pixels to look
    // at. This lets a repaint be triggered by hand. Stripped in production.
    let unregister: (() => void) | undefined;
    if (process.env.NODE_ENV !== "production") {
      const paint = () => renderFeed({ canvas, module, engine, cssW: size.w, cssH: size.h, mini, reducedMotion: reduced });
      const w = window as unknown as { __argosFeeds?: Set<() => void> };
      const reg = (w.__argosFeeds ??= new Set());
      reg.add(paint);
      unregister = () => reg.delete(paint);
    }

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      size = { w: e.contentRect.width, h: e.contentRect.height };
      lastFrame = -1;
      lastPaint = 0;
      start();
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((en) => en.isIntersecting);
        if (visible) start();
      },
      { threshold: 0.02 },
    );
    io.observe(wrap);
    const onVis = () => {
      if (!document.hidden) {
        lastFrame = -1;
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      unregister?.();
    };
  }, [engine, module, mini, reduced]);

  return (
    <div ref={wrapRef} className={cn("relative aspect-video w-full overflow-hidden bg-black", className)}>
      <canvas ref={ref} className="feed" aria-label={`Feed simulado · ${module}`} role="img" />
    </div>
  );
}
