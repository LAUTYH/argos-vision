"use client";

import { DEFECT_LABEL, WIND_ASSETS } from "@/lib/data/company";
import { inspeccionState } from "@/lib/sim/aggregate";
import { BLADE_LENGTH_M, currentPass, defectsFor, passStats } from "@/lib/sim/modules/inspeccion";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { Badge } from "@/components/ui/badge";
import { cn, fmt } from "@/lib/utils";

const SEV_TONE = { alta: "red", media: "amber", baja: "cyan" } as const;

function AssetPanels() {
  const engine = useEngine();
  useEngineSlow();
  const state = inspeccionState(engine);
  const pass = currentPass(state);
  const stats = passStats(state);
  const seen = stats.seen.slice().sort((a, b) => a.u - b.u);
  return (
    <div className="flex flex-col gap-4">
      <Panel title={`${pass.assetId} · pala ${pass.blade}`} aside={<span className="num text-[10px] text-dim">{seen.length} / {stats.total} defectos</span>}>
        {seen.length === 0 ? (
          <div className="px-3 py-5 text-center text-[12px] text-muted">Sin defectos en el tramo recorrido.</div>
        ) : (
          <ul className="divide-y divide-border">
            {seen.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <Badge tone={SEV_TONE[d.severity]}>{d.severity}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-text">{DEFECT_LABEL[d.type]}</div>
                  <div className="num text-[10px] text-dim">
                    {fmt(d.u * BLADE_LENGTH_M, 1)} m desde raíz · {fmt(d.areaPct, 2)} % área
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Historial por activo">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
              <th className="px-3 py-1.5 text-left font-medium">Activo</th>
              <th className="py-1.5 text-left font-medium">Últ. insp.</th>
              <th className="py-1.5 text-right font-medium">Defectos</th>
              <th className="py-1.5 text-right font-medium">Área</th>
              <th className="px-3 py-1.5 text-right font-medium">Sev. máx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {WIND_ASSETS.map((a) => {
              const all = (["A", "B", "C"] as const).flatMap((b) => defectsFor(engine.seed, a.id, b));
              const max = all.some((d) => d.severity === "alta") ? "alta" : all.some((d) => d.severity === "media") ? "media" : "baja";
              const active = a.id === pass.assetId;
              return (
                <tr key={a.id} className={cn(active && "bg-white/[0.03]")}>
                  <td className="px-3 py-1.5">
                    <div className="num flex items-center gap-1.5 text-text">
                      {active ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                      {a.id}
                    </div>
                    <div className="text-[10px] text-dim">{a.model}</div>
                  </td>
                  <td className="num py-1.5 text-muted">{a.lastInspection}</td>
                  <td className="num py-1.5 text-right text-text">{all.length}</td>
                  <td className="num py-1.5 text-right text-muted">
                    {fmt(all.reduce((acc, d) => acc + d.areaPct, 0), 1)} <span className="text-dim">%</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Badge tone={SEV_TONE[max]}>{max}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export default function Page() {
  const engine = useEngine();
  useEngineSlow();
  const stats = passStats(inspeccionState(engine));
  return <ModulePage module="inspeccion" side={<AssetPanels />} kpiText={{ severity: stats.max }} />;
}
