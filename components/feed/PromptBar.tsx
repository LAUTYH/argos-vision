"use client";

import { CornerDownLeft, Eye, EyeOff, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { classColor, suggestionsFor } from "@/lib/sim/classes";
import type { ModuleId } from "@/lib/sim/types";
import { useEngine, useEngineSlow, useEngineUi } from "@/lib/store/engine-hooks";
import { useUi } from "@/lib/store/ui";
import { Hint } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const PLACEHOLDER: Record<ModuleId, string> = {
  recepcion: "Describí qué detectar: caja dañada, pallet sin film, etiqueta…",
  seguridad: "Describí qué detectar: persona sin casco, persona en zona restringida…",
  flujo: "Describí qué detectar: persona sin chaleco, operario…",
  patio: "Describí qué detectar: montacarga en contramano, camión en dársena…",
  inspeccion: "Describí qué detectar: grieta, erosión, impacto de rayo…",
  documentos: "Describí qué extraer: número de remito, CUIT, cantidad, firma…",
};

/**
 * The centre of the UX: a natural-language class is added to the scene and
 * grounded on the next inference pass, without training anything.
 */
export function PromptBar({ module }: { module: ModuleId }) {
  const engine = useEngine();
  useEngineUi();
  useEngineSlow();
  const ui = useUi();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const draft = ui.reelDraft && ui.reelDraft.module === module ? ui.reelDraft.text : null;
  const classes = engine.classes[module];
  const counts = engine.classCounts(module);
  const miss = engine.lastPromptMiss[module];
  const suggestions = suggestionsFor(module).filter((s) => !classes.some((c) => c.spec.key === s.key)).slice(0, 4);

  useEffect(() => {
    if (draft !== null) inputRef.current?.focus({ preventScroll: true });
  }, [draft]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q) return;
    engine.addPrompt(module, q);
    setValue("");
  };

  return (
    <section className="panel px-4 pb-3 pt-3" aria-label="Prompt de detección">
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <Sparkles size={16} className="shrink-0 text-accent" aria-hidden />
        <label htmlFor={`prompt-${module}`} className="sr-only">
          Qué detectar
        </label>
        <input
          id={`prompt-${module}`}
          ref={inputRef}
          value={draft ?? value}
          onChange={(e) => {
            setValue(e.target.value);
            if (miss) engine.clearPromptMiss(module);
          }}
          placeholder={PLACEHOLDER[module]}
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-dim"
        />
        <div className="hidden items-center gap-1.5 text-[11px] text-dim sm:flex">
          <span>detectar</span>
          <Kbd>
            <CornerDownLeft size={10} />
          </Kbd>
        </div>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {classes.map((c) => {
          const color = classColor(c.spec);
          const pending = engine.isPending(module, c.spec.key);
          const n = counts[c.spec.key] ?? 0;
          return (
            <span
              key={c.spec.key}
              className={cn(
                "group inline-flex h-7 items-center gap-1.5 rounded-md border pl-2 pr-1 text-[12px] transition-colors duration-150",
                c.visible ? "border-border-strong bg-surface-2 text-text" : "border-border bg-transparent text-dim",
              )}
              style={c.visible ? { borderColor: `${color}66` } : undefined}
            >
              <span className="h-2 w-2 rounded-[2px]" style={{ background: c.visible ? color : "transparent", boxShadow: c.visible ? undefined : `inset 0 0 0 1px ${color}` }} />
              <span>{c.spec.label}</span>
              {pending ? (
                <Loader2 size={12} className="spin text-muted" aria-label="Grounding en curso" />
              ) : (
                <span className={cn("num min-w-[16px] text-center text-[11px]", n > 0 ? "text-muted" : "text-dim")}>{n}</span>
              )}
              <Hint label={c.visible ? "Ocultar clase" : "Mostrar clase"}>
                <button
                  type="button"
                  onClick={() => engine.toggleClass(module, c.spec.key)}
                  className="rounded p-0.5 text-dim hover:bg-white/[0.06] hover:text-text"
                  aria-label={c.visible ? `Ocultar ${c.spec.label}` : `Mostrar ${c.spec.label}`}
                >
                  {c.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </Hint>
              {!c.spec.base ? (
                <button
                  type="button"
                  onClick={() => engine.removeClass(module, c.spec.key)}
                  className="rounded p-0.5 text-dim hover:bg-white/[0.06] hover:text-text"
                  aria-label={`Quitar ${c.spec.label}`}
                >
                  <X size={12} />
                </button>
              ) : null}
            </span>
          );
        })}
        {suggestions.length ? <span className="mx-1 h-4 w-px bg-border-strong" aria-hidden /> : null}
        {suggestions.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => submit(s.suggest ?? s.label)}
            className="h-7 rounded-md border border-dashed border-border-strong px-2 text-[12px] text-muted transition-colors duration-150 hover:border-white/20 hover:text-text"
          >
            + {s.suggest ?? s.label}
          </button>
        ))}
        {miss ? (
          <span className="ml-auto inline-flex h-7 items-center gap-2 rounded-md border border-amber/40 bg-amber/10 px-2 text-[12px] text-amber" role="status">
            Sin resultados para “{miss}” en esta escena
            <button type="button" onClick={() => engine.clearPromptMiss(module)} className="rounded p-0.5 hover:bg-white/[0.06]" aria-label="Cerrar">
              <X size={12} />
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
