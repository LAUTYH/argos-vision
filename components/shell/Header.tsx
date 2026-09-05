"use client";

import { Keyboard, Pause, Play, Radio } from "lucide-react";
import { usePathname } from "next/navigation";
import { MODULES, SHIFT, SIM_DATE, SITE_BY_ID, simClock } from "@/lib/data/company";
import { useEngine, useEngineSlow, useEngineUi } from "@/lib/store/engine-hooks";
import { setUi, useUi } from "@/lib/store/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";

function titleFor(pathname: string): { title: string; sub: string } {
  const m = MODULES.find((x) => x.path === pathname);
  if (m) return { title: m.title, sub: `${SITE_BY_ID[m.site].name} · ${m.camera}` };
  if (pathname === "/arena") return { title: "Model bench", sub: "LocateAnything-3B vs Qwen3-VL vs Rex-Omni · cifras del paper" };
  return { title: "Torre de control", sub: "Vantor Group · 4 sitios · vista consolidada" };
}

export function Header() {
  const pathname = usePathname();
  const engine = useEngine();
  useEngineSlow();
  useEngineUi();
  const ui = useUi();
  const { title, sub } = titleFor(pathname);
  const alerts = engine.activeAlerts();
  return (
    <header className="glass fixed left-16 right-0 top-0 z-30 flex h-14 items-center gap-4 border-b border-border px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-text">{title}</h1>
          {ui.simBadge ? (
            <Hint label="Ningún modelo está corriendo. Escenas y detecciones se generan proceduralmente con semilla fija. Tecla S para ocultar.">
              <Badge tone="amber" className="cursor-help">
                Datos simulados
              </Badge>
            </Hint>
          ) : null}
        </div>
        <div className="truncate text-[11px] text-muted">{sub}</div>
      </div>
      <div className="hidden items-center gap-3 md:flex">
        <Hint label={`Alertas de severidad media o alta en los últimos 2 minutos, sumadas en los 6 módulos`}>
          <div className="num flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted">
            <Radio size={12} className={alerts > 0 ? "text-red" : "text-dim"} />
            <span className="text-text">{alerts}</span> alertas
          </div>
        </Hint>
        <div className="num text-right leading-tight">
          <div className="text-[13px] font-medium text-text">{simClock(engine.t)}</div>
          <div className="text-[10px] text-muted">
            {SHIFT.code} · {SIM_DATE}
          </div>
        </div>
        <Hint label={engine.playing ? "Pausar simulación (Espacio)" : "Reanudar (Espacio)"}>
          <Button size="icon" variant="ghost" onClick={() => engine.toggle()} aria-label={engine.playing ? "Pausar" : "Reproducir"}>
            {engine.playing ? <Pause size={15} /> : <Play size={15} />}
          </Button>
        </Hint>
        <Hint
          label={
            <span className="flex items-center gap-1.5">
              Atajos <Kbd>?</Kbd>
            </span>
          }
        >
          <Button size="icon" variant="ghost" onClick={() => setUi({ shortcutsOpen: true })} aria-label="Atajos de teclado">
            <Keyboard size={15} />
          </Button>
        </Hint>
        <Button size="sm" variant={ui.reelActive ? "primary" : "outline"} onClick={() => setUi({ reelActive: !ui.reelActive })}>
          <span className={ui.reelActive ? "pulse-dot h-1.5 w-1.5 rounded-full bg-accent" : "h-1.5 w-1.5 rounded-full bg-muted"} />
          Demo reel <Kbd className="ml-1">D</Kbd>
        </Button>
      </div>
    </header>
  );
}
