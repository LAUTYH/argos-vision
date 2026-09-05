import type { ModuleId } from "@/lib/sim/types";
import { realFeedFor } from "./catalog";

/**
 * Detection tracks produced offline by `scripts/annotate-feeds.ts`. The boxes
 * are a real model's output on the real clip; the browser only reads them back.
 */

/** [trackId, class, x, y, w, h, score] with x/y/w/h normalised to 0..1. */
export type TrackBox = [number, string, number, number, number, number, number];

export interface TrackFrame {
  t: number;
  d: TrackBox[];
}

export interface TrackFile {
  clip: string;
  model: string;
  task: string;
  sampleFps: number;
  vocab: Array<{ cls: string; phrase: string }>;
  note: string;
  frames: TrackFrame[];
}

const cache = new Map<ModuleId, TrackFile>();
const pending = new Map<ModuleId, Promise<TrackFile | null>>();

export function loadedTracks(module: ModuleId): TrackFile | undefined {
  return cache.get(module);
}

/** Fetches and caches a module's track file. Safe to call repeatedly. */
export function loadTracks(module: ModuleId): Promise<TrackFile | null> {
  const hit = cache.get(module);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(module);
  if (inflight) return inflight;
  const feed = realFeedFor(module);
  if (!feed) return Promise.resolve(null);
  const p = fetch(feed.tracks)
    .then((r) => (r.ok ? (r.json() as Promise<TrackFile>) : null))
    .then((file) => {
      if (file) cache.set(module, file);
      pending.delete(module);
      return file;
    })
    .catch(() => {
      pending.delete(module);
      return null;
    });
  pending.set(module, p);
  return p;
}

/** The annotated frame at or just before `t` seconds into the clip. */
export function frameAt(file: TrackFile, t: number): TrackFrame | undefined {
  const frames = file.frames;
  if (frames.length === 0) return undefined;
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(t * file.sampleFps)));
  return frames[i];
}

/** The frame after the one at `t`, used to interpolate between samples. */
export function nextFrameAt(file: TrackFile, t: number): TrackFrame | undefined {
  const frames = file.frames;
  if (frames.length === 0) return undefined;
  const i = Math.min(frames.length - 1, Math.max(0, Math.floor(t * file.sampleFps)) + 1);
  return frames[i];
}

/** Position inside the clip for a given engine time, looping. */
export function clipTime(module: ModuleId, engineT: number): number {
  const feed = realFeedFor(module);
  if (!feed) return 0;
  const d = feed.duration;
  return ((engineT % d) + d) % d;
}
