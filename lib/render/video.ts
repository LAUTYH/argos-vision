import { realFeedFor } from "@/lib/feeds/catalog";
import { clipTime } from "@/lib/feeds/tracks";
import type { ModuleId } from "@/lib/sim/types";

/**
 * Video elements for the modules whose feed is a real clip.
 *
 * One element per module, shared by every canvas that shows that module (the
 * control tower preview and the module page draw the same element). The clip
 * plays natively and is only re-seeked when it drifts from the engine clock,
 * which keeps playback smooth while still honouring pause, scrub and speed.
 */

const DRIFT_TOLERANCE = 0.2;

interface Entry {
  el: HTMLVideoElement;
  ready: boolean;
}

const pool = new Map<ModuleId, Entry>();

function create(module: ModuleId): Entry | null {
  const feed = realFeedFor(module);
  if (!feed || typeof document === "undefined") return null;
  const el = document.createElement("video");
  el.src = feed.clip;
  el.muted = true;
  el.defaultMuted = true;
  el.loop = true;
  el.playsInline = true;
  el.preload = "auto";
  el.crossOrigin = "anonymous";
  // Chrome will not decode a detached element reliably, so it lives in the
  // document, hidden and inert. It is never the thing the user sees: every
  // frame is drawn into the feed canvas.
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  const entry: Entry = { el, ready: el.readyState >= 2 };
  const markReady = () => {
    entry.ready = true;
  };
  el.addEventListener("loadeddata", markReady);
  el.addEventListener("canplay", markReady);
  // A muted, in-page video may still be refused autoplay; the draw loop retries.
  void el.play().catch(() => undefined);
  pool.set(module, entry);
  return entry;
}

export function getVideo(module: ModuleId): HTMLVideoElement | null {
  const hit = pool.get(module) ?? create(module);
  if (!hit) return null;
  if (!hit.ready && hit.el.readyState >= 2) hit.ready = true;
  return hit.ready && hit.el.videoWidth > 0 ? hit.el : null;
}

/** True once the element has enough data to be drawn. */
export function videoReady(module: ModuleId): boolean {
  const hit = pool.get(module) ?? create(module);
  return hit?.ready === true;
}

/**
 * Keeps a clip aligned with the engine. Playing clips are left to run and only
 * corrected on drift; a paused or scrubbed engine pins the frame.
 */
export function syncVideo(module: ModuleId, engineT: number, playing: boolean, speed: number): void {
  const entry = pool.get(module) ?? create(module);
  if (!entry || !entry.ready) return;
  const el = entry.el;
  const target = clipTime(module, engineT);
  if (!playing) {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - target) > 0.03) el.currentTime = target;
    return;
  }
  if (el.playbackRate !== speed) el.playbackRate = speed;
  if (el.paused) void el.play().catch(() => undefined);
  const drift = Math.abs(el.currentTime - target);
  // The clip loops, so a wrap looks like a full-duration jump; ignore those.
  const feed = realFeedFor(module);
  const wrapped = feed ? Math.abs(drift - feed.duration) < DRIFT_TOLERANCE : false;
  if (drift > DRIFT_TOLERANCE && !wrapped) el.currentTime = target;
}

/** Releases every element; used when the page unmounts in development. */
export function disposeVideos(): void {
  for (const { el } of pool.values()) {
    el.pause();
    el.removeAttribute("src");
    el.load();
    el.remove();
  }
  pool.clear();
}
