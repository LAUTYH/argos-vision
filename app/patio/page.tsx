"use client";

import { DOCK_COUNT } from "@/lib/data/company";
import { patioState } from "@/lib/sim/aggregate";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { cn, fmtTime } from "@/lib/utils";

function DocksAndFleet() {
  const engine = useEngine();
  useEngineSlow();
  const state = patioState(engine);
  const trucks = state.entities.filter((e) => e.kind === "camion");
  const forklifts = state.entities.filter((e) => e.kind === "montacarga");
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Dársenas" aside={<span className="num text-[10px] text-dim">{state.data.docks.filter((d) => d.truckId > 0).length} / {DOCK_COUNT} ocupadas</span>}>
        <div className="grid grid-cols-4 gap-2 p-3">
          {state.data.docks.map((d, i) => {
            const truck = trucks.find((t) => t.id === d.truckId);
            const status = !truck ? "libre" : truck.kind === "camion" && truck.state === "docking" ? "maniobra" : "ocupada";
            const since = truck && truck.kind === "camion" && truck.state === "docked" ? Math.max(0, engine.t - d.since) : 0;
            return (
              <div key={i} className={cn("rounded-md border px-2 py-1.5", status === "libre" ? "border-border bg-transparent" : status === "maniobra" ? "border-cyan/40 bg-cyan/[0.06]" : "border-border-strong bg-surface-2")}>
                <div className="flex items-center justify-between">
                  <span className="num text-[12px] font-medium text-text">D{i + 1}</span>
                  <span className={cn("h-1.5 w-1.5 rounded-full", status === "libre" ? "bg-white/20" : status === "maniobra" ? "bg-cyan" : "bg-accent")} />
                </div>
                <div className="num mt-0.5 truncate text-[10px] text-muted">{truck && truck.kind === "camion" ? truck.plate : "libre"}</div>
                <div className="num text-[10px] text-dim">{status === "ocupada" ? fmtTime(since + 1680) : status === "maniobra" ? "ingresando" : "—"}</div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Flota de autoelevadores">
        <ul className="divide-y divide-border">
          {forklifts.map((f) => {
            if (f.kind !== "montacarga") return null;
            const moving = f.speed > 0.2;
            const parked = f.dwell > 1e6;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                <span className={cn("h-2 w-2 rounded-full", f.inPedestrian ? "bg-red" : f.wrongWay ? "bg-amber" : moving ? "bg-accent" : "bg-white/20")} />
                <span className="num w-12 text-text">{f.code}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{parked ? "sin operador" : f.operator}</span>
                <span className={cn("num text-[11px]", f.inPedestrian ? "text-red" : f.wrongWay ? "text-amber" : "text-dim")}>
                  {parked ? "estacionado" : f.inPedestrian ? "zona peatonal" : f.wrongWay ? "contramano" : moving ? (f.carrying ? "con carga" : "vacío") : "detenido"}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

export default function Page() {
  return <ModulePage module="patio" side={<DocksAndFleet />} />;
}
