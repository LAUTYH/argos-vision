import { MODULE_BY_ID, simClock } from "@/lib/data/company";
import { SCENE_H, SCENE_W } from "@/lib/sim/camera";
import type { Engine } from "@/lib/sim/engine";
import { FLUJO_CAM, type FlujoData } from "@/lib/sim/modules/flujo";
import type { DocumentosData } from "@/lib/sim/modules/documentos";
import type { InspeccionData } from "@/lib/sim/modules/inspeccion";
import { paintScene, paintVideoGrain } from "@/lib/sim/scene";
import type { ModuleId } from "@/lib/sim/types";
import type { WorldState } from "@/lib/sim/world";
import { paintAgents } from "./agents";
import { paintAnnotations, paintBurnIn } from "./annotate";
import { prepareSurface } from "./canvas";

export interface FeedRenderInput {
  canvas: HTMLCanvasElement;
  module: ModuleId;
  engine: Engine;
  cssW: number;
  cssH: number;
  mini: boolean;
  reducedMotion: boolean;
}

/** Draws one frame of a feed: background → agents → grain → annotations → burn-in. */
export function renderFeed(i: FeedRenderInput): void {
  // Mini previews render at 1× and reuse a 1× background cache: a 2× cache
  // for six simultaneous feeds costs far more memory than it buys on a
  // 341 px-wide tile.
  const s = prepareSurface(i.canvas, i.cssW, i.cssH, i.mini ? 1 : 2);
  if (!s) return;
  const { ctx } = s;
  const e = i.engine;
  const world = e.worlds[i.module];
  const t = e.t;
  const dpr = i.mini ? 1 : Math.min(2, window.devicePixelRatio || 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCENE_W, SCENE_H);
  ctx.clip();

  let param = 0;
  if (i.module === "inspeccion") param = (world.state as WorldState<InspeccionData>).data.passT;
  if (i.module === "documentos") param = (world.state as WorldState<DocumentosData>).data.docIdx;

  paintScene(ctx, { module: i.module, t, seed: e.seed, param, dpr });
  paintAgents(ctx, i.module, world, t);
  if (!i.mini) paintVideoGrain(ctx, t, e.seed, 0.05);

  const settings = e.feeds[i.module];
  if (!settings.raw) {
    paintAnnotations(ctx, {
      module: i.module,
      t,
      frames: e.frames[i.module],
      zones: world.zones(),
      settings,
      classes: e.classes[i.module],
      scale: s.scale,
      mini: i.mini,
      heat: i.module === "flujo" ? { grid: (world.state as WorldState<FlujoData>).data.heat, cam: FLUJO_CAM } : undefined,
      reducedMotion: i.reducedMotion,
    });
  }
  const meta = MODULE_BY_ID[i.module];
  paintBurnIn(ctx, meta.camera.split(" · ")[0] ?? "CAM", simClock(t), 1 / s.scale, i.mini, e.playing);
  ctx.restore();
}
