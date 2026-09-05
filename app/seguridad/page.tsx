"use client";

import { Check, X } from "lucide-react";
import { seguridadState } from "@/lib/sim/aggregate";
import { useEngine, useEngineSlow } from "@/lib/store/engine-hooks";
import { ModulePage, Panel } from "@/components/modules/ModulePage";
import { cn } from "@/lib/utils";

function Ppe({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", ok ? "text-muted" : "text-red")}>
      {ok ? <Check size={12} className="text-accent" /> : <X size={12} />} {label}
    </span>
  );
}

function PeopleTable() {
  const engine = useEngine();
  useEngineSlow();
  const state = seguridadState(engine);
  const people = state.entities.filter((e) => e.kind === "persona");
  return (
    <Panel title="Personas en escena" aside={<span className="num text-[10px] text-dim">{people.length} tracks</span>}>
      {people.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-muted">Nadie en el encuadre.</div>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((p) => {
            if (p.kind !== "persona") return null;
            const bad = !p.helmet || !p.vest || p.restricted;
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", p.restricted ? "bg-red" : bad ? "bg-amber" : "bg-accent")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-text">
                    <span className="truncate">{p.name}</span>
                    <span className="num text-[10px] text-dim">#{String(p.trackId).padStart(4, "0")}</span>
                  </div>
                  <div className="truncate text-[10px] text-dim">
                    {p.role}
                    {p.zone ? <span className="text-red"> · {p.zone}</span> : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Ppe ok={p.helmet} label="casco" />
                  <Ppe ok={p.vest} label="chaleco" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-border px-3 py-2 text-[11px] text-dim">
        Zona restringida: <span className="text-muted">Prensas · Nave 2</span> · acceso con permiso de trabajo
      </div>
    </Panel>
  );
}

export default function Page() {
  return <ModulePage module="seguridad" side={<PeopleTable />} />;
}
