"use client";

import { SKU_BY_CODE } from "@/lib/data/company";
import { documentosState, recepcionState } from "@/lib/sim/aggregate";
import { activeDocument } from "@/lib/sim/modules/documentos";
import { activeRemito, skuTotal } from "@/lib/sim/modules/recepcion";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { Badge } from "@/components/ui/badge";
import { cn, fmt } from "@/lib/utils";

function FieldsAndCrossCheck() {
  const engine = useEngine();
  useEngineSlow();
  const docState = documentosState(engine);
  const recState = recepcionState(engine);
  const doc = activeDocument(docState);
  const remito = activeRemito(recState);
  const sameRemito = doc.number === remito.number;
  const frame = engine.frames.documentos.curr;
  const confOf = (entityId: number): number | null => {
    const d = frame?.detections.find((x) => x.entityId === entityId);
    return d ? d.conf : null;
  };
  const header = docState.entities.filter((e) => e.kind === "campo" && e.group === "cabecera");
  const totalDiff = remito.lines.reduce((acc, l) => acc + Math.abs(skuTotal(recState, l.sku) - l.expected), 0) + Object.values(recState.data.unexpected).reduce((a, b) => a + b, 0);
  const done = recState.data.done;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Campos extraídos · cabecera" aside={frame ? <span className="num text-[10px] text-dim">{frame.detections.length} cajas · {fmt(frame.latencyMs, 0)} ms · 1 pasada</span> : null}>
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-border">
            {header.map((f) => {
              if (f.kind !== "campo") return null;
              const c = confOf(f.id);
              return (
                <tr key={f.id}>
                  <td className="px-3 py-1.5 text-[11px] text-dim">{f.label}</td>
                  <td className="num py-1.5 text-text">{f.value}</td>
                  <td className={cn("num px-3 py-1.5 text-right text-[11px]", c === null ? "text-dim" : c < 0.8 ? "text-amber" : "text-muted")}>{c === null ? "…" : c.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel
        title="Cruce con recepción"
        aside={
          sameRemito ? (
            <Badge tone={done ? (totalDiff > 0 ? "amber" : "accent") : "cyan"}>{done ? (totalDiff > 0 ? `${totalDiff} dif.` : "conforme") : "conteo en curso"}</Badge>
          ) : (
            <Badge tone="neutral">otro remito en cinta</Badge>
          )
        }
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.06em] text-dim">
              <th className="px-3 py-1.5 text-left font-medium">SKU</th>
              <th className="py-1.5 text-right font-medium">Remito</th>
              <th className="py-1.5 text-right font-medium">Contado</th>
              <th className="px-3 py-1.5 text-right font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {doc.lines.map((line) => {
              const counted = sameRemito ? skuTotal(recState, line.sku) : null;
              const delta = counted === null ? 0 : counted - line.expected;
              const status = counted === null ? "—" : delta === 0 ? "ok" : delta < 0 ? (done ? "faltan" : "pend.") : "sobran";
              return (
                <tr key={line.sku}>
                  <td className="px-3 py-1.5">
                    <div className="num text-text">{line.sku}</div>
                    <div className="truncate text-[10px] text-dim">{SKU_BY_CODE[line.sku]?.name}</div>
                  </td>
                  <td className="num py-1.5 text-right text-muted">{line.expected}</td>
                  <td className="num py-1.5 text-right text-text">{counted ?? "—"}</td>
                  <td className={cn("num px-3 py-1.5 text-right text-[11px]", status === "ok" ? "text-accent" : status === "faltan" ? "text-red" : status === "sobran" ? "text-amber" : "text-dim")}>
                    {status === "ok" ? "ok" : status === "—" ? "—" : `${status} ${Math.abs(delta)}`}
                  </td>
                </tr>
              );
            })}
            {sameRemito
              ? Object.entries(recState.data.unexpected).map(([sku, n]) => (
                  <tr key={sku} className="bg-red/[0.05]">
                    <td className="px-3 py-1.5">
                      <div className="num text-red">{sku}</div>
                      <div className="truncate text-[10px] text-dim">no figura en el remito</div>
                    </td>
                    <td className="num py-1.5 text-right text-dim">—</td>
                    <td className="num py-1.5 text-right text-text">{n}</td>
                    <td className="num px-3 py-1.5 text-right text-[11px] text-red">no decl.</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
        <div className="border-t border-border px-3 py-2 text-[10px] text-dim">Lo contado viene del módulo Recepción en tiempo real; el remito, del documento escaneado.</div>
      </Panel>
    </div>
  );
}

export default function Page() {
  return <ModulePage module="documentos" side={<FieldsAndCrossCheck />} />;
}
