"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { LAYER_KEYS, SPEEDS, type LayerKey, type Speed } from "@/lib/sim/engine";
import type { ModuleId } from "@/lib/sim/types";
import { CLIP_LENGTH } from "@/lib/sim/world";
import { useEngine, useEngineUi } from "@/lib/store/engine-hooks";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn, fmtTime } from "@/lib/utils";

const LAYER_LABEL: Record<LayerKey, string> = {
  boxes: "Boxes",
  masks: "Masks",
  pose: "Pose",
  tracks: "Tracks",
  zones: "Zones",
  ids: "IDs",
  heat: "Heat",
};

const LAYERS_BY_MODULE: Record<ModuleId, LayerKey[]> = {
  recepcion: ["boxes", "zones", "ids"],
  seguridad: ["boxes", "pose", "tracks", "zones", "ids"],
  flujo: ["boxes", "tracks", "heat", "zones", "ids"],
  patio: ["boxes", "tracks", "zones", "ids"],
  inspeccion: ["boxes", "masks", "ids"],
  documentos: ["boxes", "ids"],
};

/** Scrub bar updated imperatively every frame; no React re-render per frame. */
function Scrub({ module }: { module: ModuleId }) {
  const engine = useEngine();
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const unsub = engine.subscribeFrame(() => {
      if (fill.current) fill.current.style.width = `${(engine.t / CLIP_LENGTH) * 100}%`;
      if (label.current) label.current.textContent = fmtTime(engine.t);
    });
    return unsub;
  }, [engine]);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span ref={label} className="num w-9 text-right text-[11px] text-muted">
        {fmtTime(engine.t)}
      </span>
      <input
        type="range"
        min={0}
        max={CLIP_LENGTH}
        step={0.1}
        defaultValue={engine.t}
        aria-label={`Posición del clip · ${module}`}
        onInput={(e) => engine.seek(Number((e.target as HTMLInputElement).value))}
        className="peer absolute h-0 w-0 opacity-0"
      />
      <div
        className="group relative h-6 min-w-0 flex-1 cursor-pointer"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={CLIP_LENGTH}
        aria-valuenow={Math.round(engine.t)}
        aria-label="Scrub"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") engine.seek(engine.t - 5);
          if (e.key === "ArrowRight") engine.seek(engine.t + 5);
        }}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          const seekTo = (clientX: number) => {
            const r = el.getBoundingClientRect();
            const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
            engine.seek(k * CLIP_LENGTH);
          };
          seekTo(e.clientX);
          const move = (ev: PointerEvent) => seekTo(ev.clientX);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08] group-hover:bg-white/[0.12]">
          <div ref={fill} className="h-full rounded-full bg-muted/70" style={{ width: `${(engine.t / CLIP_LENGTH) * 100}%` }} />
        </div>
      </div>
      <span className="num w-9 text-[11px] text-dim">{fmtTime(CLIP_LENGTH)}</span>
    </div>
  );
}

export function FeedControls({ module }: { module: ModuleId }) {
  const engine = useEngine();
  useEngineUi();
  const settings = engine.feeds[module];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2">
      <div className="flex items-center gap-1">
        <Hint label={engine.playing ? "Pausar (Espacio)" : "Reproducir (Espacio)"}>
          <Button size="iconSm" variant="ghost" onClick={() => engine.toggle()} aria-label={engine.playing ? "Pausar" : "Reproducir"}>
            {engine.playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </Hint>
        <Hint label="Volver al inicio del clip">
          <Button size="iconSm" variant="ghost" onClick={() => engine.seek(0)} aria-label="Reiniciar clip">
            <RotateCcw size={13} />
          </Button>
        </Hint>
      </div>
      <Scrub module={module} />
      <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5" role="group" aria-label="Velocidad">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => engine.setSpeed(s as Speed)}
            className={cn(
              "num h-6 rounded-[4px] px-1.5 text-[11px] transition-colors duration-150",
              engine.speed === s ? "bg-surface-3 text-text" : "text-muted hover:text-text",
            )}
            aria-pressed={engine.speed === s}
          >
            {s}×
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5" role="group" aria-label="Capas">
        {LAYERS_BY_MODULE[module].map((layer) => {
          const on = settings.layers[layer] && !settings.raw;
          return (
            <button
              key={layer}
              type="button"
              disabled={settings.raw}
              onClick={() => engine.setLayer(module, layer, !settings.layers[layer])}
              aria-pressed={on}
              className={cn(
                "h-6 rounded-[4px] px-1.5 text-[11px] transition-colors duration-150 disabled:opacity-40",
                on ? "bg-surface-3 text-text" : "text-muted hover:text-text",
              )}
            >
              {LAYER_LABEL[layer]}
            </button>
          );
        })}
      </div>
      {LAYER_KEYS.length ? (
        <Hint
          label={
            <span className="flex items-center gap-1.5">
              Sin anotaciones: el before/after para grabar <Kbd>R</Kbd>
            </span>
          }
        >
          <Button size="sm" variant={settings.raw ? "primary" : "outline"} onClick={() => engine.setRaw(module, !settings.raw)} aria-pressed={settings.raw}>
            Raw feed
          </Button>
        </Hint>
      ) : null}
    </div>
  );
}
