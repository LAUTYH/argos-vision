"use client";

import type { Kpi } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { TweenNumber } from "./TweenNumber";

const STATUS_DOT: Record<NonNullable<Kpi["status"]>, string> = {
  ok: "bg-accent",
  warn: "bg-amber",
  alert: "bg-red",
};

export function KpiCard({ kpi, size = "md", text }: { kpi: Kpi; size?: "md" | "sm"; text?: string }) {
  return (
    <div className={cn("panel flex flex-col justify-between", size === "md" ? "min-h-[84px] px-4 py-3" : "px-3 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-[11px] font-medium uppercase tracking-[0.06em] text-muted", size === "sm" && "text-[10px]")}>{kpi.label}</span>
        {kpi.status ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[kpi.status])} aria-label={`estado ${kpi.status}`} /> : null}
      </div>
      <div className={cn("num mt-1 flex items-baseline justify-end gap-1 text-right", size === "md" ? "text-[26px] leading-none" : "text-[18px] leading-none")}>
        {text !== undefined ? (
          <span className="text-text">{text}</span>
        ) : (
          <TweenNumber value={kpi.value} decimals={kpi.decimals ?? 0} className="text-text" />
        )}
        {kpi.unit ? <span className={cn("text-muted", size === "md" ? "text-[13px]" : "text-[11px]")}>{kpi.unit}</span> : null}
      </div>
      {kpi.hint ? <div className="mt-1 text-right text-[10px] text-dim">{kpi.hint}</div> : null}
    </div>
  );
}
