"use client";

import Link from "next/link";
import { ArrowUpRight, Camera } from "lucide-react";
import { MODULE_BY_ID, MODULES, SITES } from "@/lib/data/company";
import { alertsForSite, towerKpis } from "@/lib/sim/aggregate";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { FeedCanvas } from "@/components/feed/FeedCanvas";
import { KpiCard } from "@/components/kpi/KpiCard";
import { TweenNumber } from "@/components/kpi/TweenNumber";
import { Panel } from "@/components/modules/ModulePage";
import { EventList } from "@/components/timeline/EventList";
import { cn, fmt } from "@/lib/utils";

export default function TowerPage() {
  const engine = useEngine();
  useEngineSlow();
  const kpis = towerKpis(engine);
  const events = engine.events(undefined, 60);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Sitios">
        {SITES.map((site) => {
          const alerts = alertsForSite(engine, site.id);
          return (
            <div key={site.id} className="panel flex flex-col gap-3 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-text">{site.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {site.kind} · {site.location}
                  </div>
                </div>
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", alerts > 0 ? "bg-amber" : "bg-accent")} aria-label={alerts > 0 ? "con alertas" : "operativo"} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="num inline-flex items-center gap-1">
                  <Camera size={12} className="text-dim" /> {site.cameras} cámaras
                </span>
                <span className="num">
                  <span className={alerts > 0 ? "text-amber" : "text-text"}>{alerts}</span> alertas · 2 min
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {site.modules.map((m) => (
                  <Link key={m} href={MODULE_BY_ID[m].path} className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted transition-colors hover:border-white/20 hover:text-text">
                    {MODULE_BY_ID[m].short}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-9" aria-label="KPIs consolidados">
        {kpis.map((k) => (
          <KpiCard key={k.id} kpi={k} size="sm" />
        ))}
      </section>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 grid grid-cols-2 gap-4 xl:col-span-8 xl:grid-cols-3" aria-label="Vista previa de módulos">
          {MODULES.map((m) => {
            const mk = engine.kpis(m.id).slice(0, 2);
            return (
              <Link key={m.id} href={m.path} className="panel group overflow-hidden transition-colors duration-150 hover:border-white/15">
                <FeedCanvas module={m.id} mini />
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[12px] font-medium text-text">
                      {m.short}
                      <ArrowUpRight size={12} className="text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="truncate text-[10px] text-dim">{m.camera}</div>
                  </div>
                  <div className="num flex gap-3 text-right text-[11px]">
                    {mk.map((k) => (
                      <div key={k.id}>
                        <div className="text-text">
                          <TweenNumber value={k.value} decimals={k.decimals ?? 0} />
                          {k.unit ? <span className="text-dim"> {k.unit}</span> : null}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.06em] text-dim">{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
        <div className="col-span-12 xl:col-span-4">
          <Panel title="Eventos en vivo · 4 sitios" aside={<span className="num text-[10px] text-dim">{fmt(events.length)} recientes</span>} className="h-full">
            <EventList events={events} showModule dense className="max-h-[640px]" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
