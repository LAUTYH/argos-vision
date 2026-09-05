"use client";

import { SKU_BY_CODE } from "@/lib/data/company";
import { recepcionState } from "@/lib/sim/aggregate";
import { activeRemito, skuTotal, tallies } from "@/lib/sim/modules/recepcion";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { Badge } from "@/components/ui/badge";
import { cn, fmt } from "@/lib/utils";

function RemitoTable() {
  const engine = useEngine();
  useEngineSlow();
  const state = recepcionState(engine);
  const remito = activeRemito(state);
  const t = tallies(state);
  const unexpected = Object.entries(state.data.unexpected);
  const diffs = t.faltantes + t.sobrantes + t.undeclared;
  return (
    <Panel
      title={`Remito ${remito.number}`}
      aside={state.data.done ? <Badge tone={diffs > 0 ? "amber" : "accent"}>{diffs > 0 ? "con diferencias" : "sin diferencias"}</Badge> : <Badge tone="cyan">descargando</Badge>}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[11px]">
        <div className="text-dim">Proveedor</div>
        <div className="truncate text-right text-text">{remito.supplier}</div>
        <div className="text-dim">Transporte</div>
        <div className="num truncate text-right text-text">
          {remito.plate} · {remito.dock}
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
            <th className="px-3 py-1.5 text-left font-medium">SKU</th>
            <th className="py-1.5 text-right font-medium">Rem.</th>
            <th className="py-1.5 text-right font-medium">Cont.</th>
            <th className="px-3 py-1.5 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {remito.lines.map((line) => {
            const counted = skuTotal(state, line.sku);
            const delta = counted - line.expected;
            const pct = Math.min(1, counted / line.expected);
            return (
              <tr key={line.sku}>
                <td className="px-3 py-1.5">
                  <div className="num text-text">{line.sku}</div>
                  <div className="truncate text-[10px] text-dim">{SKU_BY_CODE[line.sku]?.name}</div>
                  <div className="mt-1 h-[2px] w-full rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full transition-[width] duration-300", counted > line.expected ? "bg-amber" : "bg-muted/70")} style={{ width: `${pct * 100}%` }} />
                  </div>
                </td>
                <td className="num py-1.5 text-right text-muted">{line.expected}</td>
                <td className="num py-1.5 text-right text-text">{counted}</td>
                <td className={cn("num px-3 py-1.5 text-right", delta === 0 ? "text-dim" : delta < 0 ? (state.data.done ? "text-red" : "text-muted") : "text-amber")}>
                  {delta === 0 ? "0" : delta > 0 ? `+${delta}` : delta}
                </td>
              </tr>
            );
          })}
          {unexpected.map(([sku, n]) => (
            <tr key={sku} className="bg-red/[0.05]">
              <td className="px-3 py-1.5">
                <div className="num text-red">{sku}</div>
                <div className="truncate text-[10px] text-dim">{SKU_BY_CODE[sku]?.name} · no declarado</div>
              </td>
              <td className="num py-1.5 text-right text-dim">—</td>
              <td className="num py-1.5 text-right text-text">{n}</td>
              <td className="num px-3 py-1.5 text-right text-red">+{n}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-strong text-[11px]">
            <td className="px-3 py-2 text-muted">Total</td>
            <td className="num py-2 text-right text-muted">{fmt(t.expected)}</td>
            <td className="num py-2 text-right text-text">{fmt(t.total + t.undeclared)}</td>
            <td className="num px-3 py-2 text-right text-muted">
              {t.total + t.undeclared - t.expected >= 0 ? "+" : ""}
              {fmt(t.total + t.undeclared - t.expected)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

export default function Page() {
  return <ModulePage module="recepcion" side={<RemitoTable />} />;
}
