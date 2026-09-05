"use client";

import { hasRealFeed } from "@/lib/feeds/catalog";
import { realKpis } from "@/lib/feeds/stats";
import type { Kpi, ModuleId } from "@/lib/sim/types";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { FeedPanel } from "@/components/feed/FeedPanel";
import { PromptBar } from "@/components/feed/PromptBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { EventList } from "@/components/timeline/EventList";

export function Panel({ title, children, className = "", aside }: { title: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function ModulePage({ module, side, kpiText, extraKpis = [] }: { module: ModuleId; side: React.ReactNode; kpiText?: Record<string, string>; extraKpis?: Kpi[] }) {
  const engine = useEngine();
  useEngineSlow();
  // A real clip reports what the detector saw; a procedural scene reports
  // what the simulated world knows.
  const kpis = hasRealFeed(module) ? realKpis(engine, module) : [...engine.kpis(module), ...extraKpis];
  const events = engine.events(module, 40);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <PromptBar module={module} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
          <FeedPanel module={module} />
          <Panel title="Timeline de eventos" aside={<span className="num text-[10px] text-dim">{events.length} registrados</span>}>
            <EventList events={events} className="max-h-[300px]" />
          </Panel>
        </div>
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <div className="grid grid-cols-2 gap-4">
            {kpis.map((k) => (
              <KpiCard key={k.id} kpi={k} text={kpiText?.[k.id]} />
            ))}
          </div>
          {hasRealFeed(module) ? (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
              Lo de arriba se cuenta sobre el clip. Lo de abajo es el <span className="text-text">registro operativo</span> de Vantor —
              remitos, dársenas, patentes — que una cámara no puede leer: son datos de ejemplo, no salen del video.
            </p>
          ) : null}
          {side}
        </div>
      </div>
    </div>
  );
}
