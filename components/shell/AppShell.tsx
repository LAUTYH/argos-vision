"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MODULES } from "@/lib/data/company";
import { setCanvasFonts } from "@/lib/render/canvas";
import { useEngine, useEngineLoop } from "@/lib/store/engine-hooks";
import { getUi, setUi, useUi } from "@/lib/store/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "./CommandPalette";
import { DemoReel } from "./DemoReel";
import { Header } from "./Header";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function AppShell({ children, mono, sans }: { children: React.ReactNode; mono: string; sans: string }) {
  setCanvasFonts(mono, sans);
  useEngineLoop();
  const engine = useEngine();
  const ui = useUi();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          setUi({ paletteOpen: !getUi().paletteOpen });
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      const k = e.key;
      const mod = MODULES.find((m) => m.path === pathname);
      switch (k) {
        case "h":
        case "H":
          setUi({ chromeHidden: !getUi().chromeHidden });
          break;
        case "s":
        case "S":
          setUi({ simBadge: !getUi().simBadge });
          break;
        case " ":
          e.preventDefault();
          engine.toggle();
          break;
        case "r":
        case "R":
          if (mod) engine.setRaw(mod.id, !engine.feeds[mod.id].raw);
          break;
        case "ArrowLeft":
          engine.seek(engine.t - (e.shiftKey ? 30 : 5));
          break;
        case "ArrowRight":
          engine.seek(engine.t + (e.shiftKey ? 30 : 5));
          break;
        case "?":
          setUi({ shortcutsOpen: !getUi().shortcutsOpen });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, pathname]);

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      <div className="relative min-h-screen">
        {!ui.chromeHidden ? <Sidebar /> : null}
        {!ui.chromeHidden ? <Header /> : null}
        <main className={cn("min-h-screen transition-[padding] duration-200 ease-[var(--ease-spring)]", ui.chromeHidden ? "p-4" : "pl-[80px] pr-4 pt-[64px] pb-6")}>{children}</main>
        <DemoReel />
        <CommandPalette />
        <ShortcutsDialog />
        <div className="grain" aria-hidden />
      </div>
    </TooltipProvider>
  );
}
