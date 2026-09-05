"use client";

import { MODULE_BY_ID, SITE_BY_ID } from "@/lib/data/company";
import { realFeedFor } from "@/lib/feeds/catalog";
import { loadedTracks } from "@/lib/feeds/tracks";
import { Badge } from "@/components/ui/badge";
import type { ModuleId } from "@/lib/sim/types";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { Hint } from "@/components/ui/tooltip";
import { fmt } from "@/lib/utils";
import { FeedCanvas } from "./FeedCanvas";
import { FeedControls } from "./FeedControls";

function Metric({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint: string }) {
  return (
    <Hint label={hint}>
      <div className="num flex cursor-help items-baseline gap-1 text-[11px]">
        <span className="text-dim">{label}</span>
        <span className="text-text">{value}</span>
        {unit ? <span className="text-dim">{unit}</span> : null}
      </div>
    </Hint>
  );
}

export function FeedPanel({ module }: { module: ModuleId }) {
  const engine = useEngine();
  useEngineSlow();
  const meta = MODULE_BY_ID[module];
  const site = SITE_BY_ID[meta.site];
  const tm = engine.telemetry[module];
  const warm = tm.fps > 0;
  const real = realFeedFor(module);
  const tracks = real ? loadedTracks(module) : undefined;
  const boxes = engine.frames[module].curr?.detections.length ?? 0;
  if (real) {
    return (
      <section className="panel overflow-hidden" aria-label={`Feed real · ${meta.title}`}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 truncate text-[11px] text-muted">
            <span className="font-medium text-text">{meta.camera}</span>
            <span className="mx-1.5 text-dim">·</span>
            {site.name}
          </div>
          <Badge tone="cyan">Video real</Badge>
          <div className="hidden items-center gap-3 sm:flex">
            <Metric label="cajas" value={String(boxes)} hint="Detecciones del detector en este frame del clip." />
            <Metric label="anot" value={tracks ? String(tracks.sampleFps) : "—"} unit="fps" hint="Frecuencia a la que se anotó el clip fuera de línea." />
            <Metric label="modelo" value={tracks ? "OWL-ViT" : "—"} hint="Las cajas las produjo OWL-ViT sobre este clip, fuera del navegador. No hay modelo corriendo acá." />
          </div>
        </div>
        <FeedCanvas module={module} />
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-dim">
          Clip: {real.source} · {real.credit} · anotado con {tracks?.model ?? "OWL-ViT"} · cajas reales, sin modelo en el navegador
        </div>
        <FeedControls module={module} />
      </section>
    );
  }
  return (
    <section className="panel overflow-hidden" aria-label={`Feed · ${meta.title}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1 truncate text-[11px] text-muted">
          <span className="font-medium text-text">{meta.camera}</span>
          <span className="mx-1.5 text-dim">·</span>
          {site.name}
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <Metric label="lat" value={warm ? fmt(tm.latencyMs, 0) : "—"} unit="ms" hint="Latencia de inferencia por frame (simulada). Crece con la cantidad de cajas decodificadas." />
          <Metric label="inf" value={warm ? fmt(tm.fps, 1) : "—"} unit="fps" hint="Frames inferidos por segundo. Entre frames, las cajas se interpolan." />
          <Metric label="boxes" value={warm ? fmt(tm.boxesPerSec, 0) : "—"} unit="/s" hint="Cajas decodificadas por segundo (simulado). Para la cifra del paper, ver Model bench." />
          <Metric label="gpu" value={warm ? fmt(tm.gpuUtil, 0) : "—"} unit="%" hint="Utilización de GPU simulada · runtime BF16." />
          <Metric label="stream" value={warm ? fmt(tm.streamFps, 0) : "—"} unit="fps" hint="Cuadros por segundo del stream de cámara (simulado)." />
        </div>
      </div>
      <FeedCanvas module={module} />
      <FeedControls module={module} />
    </section>
  );
}
