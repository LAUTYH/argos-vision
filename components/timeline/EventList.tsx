"use client";

import { AlertTriangle, Circle, Info, ShieldAlert } from "lucide-react";
import { MODULE_BY_ID, SITE_BY_ID, simClock } from "@/lib/data/company";
import type { Severity, SimEvent } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

const SEV: Record<Severity, { label: string; cls: string; Icon: typeof Info }> = {
  high: { label: "Alta", cls: "text-red border-red/40 bg-red/10", Icon: ShieldAlert },
  medium: { label: "Media", cls: "text-amber border-amber/40 bg-amber/10", Icon: AlertTriangle },
  low: { label: "Baja", cls: "text-cyan border-cyan/40 bg-cyan/10", Icon: Circle },
  info: { label: "Info", cls: "text-muted border-border-strong bg-surface-2", Icon: Info },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className={cn("inline-flex h-[18px] w-[46px] shrink-0 items-center justify-center rounded-[3px] border text-[10px] font-semibold uppercase tracking-[0.06em]", s.cls)}>
      {s.label}
    </span>
  );
}

export function EventList({ events, showModule = false, emptyLabel = "Sin eventos todavía en esta ventana.", className, dense = false }: { events: SimEvent[]; showModule?: boolean; emptyLabel?: string; className?: string; dense?: boolean }) {
  if (events.length === 0) {
    return (
      <div className={cn("flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-4 text-center", className)}>
        <span className="text-[12px] text-muted">{emptyLabel}</span>
        <span className="text-[11px] text-dim">Los eventos se registran a medida que la escena avanza.</span>
      </div>
    );
  }
  return (
    <ol className={cn("scrollbar-thin divide-y divide-border overflow-y-auto", className)}>
      {events.map((ev) => {
        const m = MODULE_BY_ID[ev.module];
        return (
          <li key={`${ev.module}-${ev.id}`} className={cn("flex items-start gap-3 px-3", dense ? "py-1.5" : "py-2")}>
            <span className="num w-[62px] shrink-0 pt-0.5 text-[11px] text-muted">{simClock(ev.t)}</span>
            <SeverityBadge severity={ev.severity} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-text">{ev.title}</div>
              <div className="truncate text-[11px] text-dim">
                {showModule ? (
                  <>
                    <span className="text-muted">{m.short}</span> · {SITE_BY_ID[m.site].name} ·{" "}
                  </>
                ) : null}
                {ev.detail}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
