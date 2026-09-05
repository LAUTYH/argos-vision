"use client";

import { flujoState } from "@/lib/sim/aggregate";
import { FLOW_ZONES } from "@/lib/sim/modules/flujo";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { cn, fmt } from "@/lib/utils";

function ZonesTable() {
  const engine = useEngine();
  useEngineSlow();
  const state = flujoState(engine);
  return (
    <Panel title="Zonas y permanencia">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
            <th className="px-3 py-1.5 text-left font-medium">Zona</th>
            <th className="py-1.5 text-right font-medium">Ahora</th>
            <th className="py-1.5 text-right font-medium">Visitas</th>
            <th className="px-3 py-1.5 text-right font-medium">Perm. media</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {FLOW_ZONES.map((z) => {
            const st = state.data.zoneStats[z.id];
            const current = st?.current ?? 0;
            const over = current > z.capacity;
            const mean = st && st.visits > 0 ? st.totalSeconds / st.visits / 60 : 0;
            return (
              <tr key={z.id}>
                <td className="px-3 py-2">
                  <div className="text-text">{z.label}</div>
                  <div className="mt-1 flex gap-0.5">
                    {Array.from({ length: z.capacity }).map((_, i) => (
                      <span key={i} className={cn("h-1.5 w-3 rounded-[1px]", i < current ? (over ? "bg-amber" : "bg-muted") : "bg-white/[0.06]")} />
                    ))}
                    {over ? <span className="num ml-1 text-[10px] text-amber">+{current - z.capacity}</span> : null}
                  </div>
                </td>
                <td className={cn("num py-2 text-right", over ? "text-amber" : "text-text")}>
                  {current}
                  <span className="text-dim"> / {z.capacity}</span>
                </td>
                <td className="num py-2 text-right text-muted">{st?.visits ?? 0}</td>
                <td className="num px-3 py-2 text-right text-text">
                  {fmt(mean, 1)} <span className="text-dim">min</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[10px] text-dim">
        <span>Heatmap de permanencia</span>
        <span className="h-1.5 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, rgba(76,201,240,0.25), rgba(245,165,36,0.6), rgba(229,72,77,0.75))" }} />
        <span>más tiempo</span>
      </div>
    </Panel>
  );
}

export default function Page() {
  return <ModulePage module="flujo" side={<ZonesTable />} />;
}
