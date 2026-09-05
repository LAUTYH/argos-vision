"use client";

import { useRouter } from "next/navigation";
import { Command as CommandIcon, EyeOff, Film, Layers, Pause, Play } from "lucide-react";
import { MODULES } from "@/lib/data/company";
import { useEngine } from "@/lib/store/engine-hooks";
import { getUi, setUi, useUi } from "@/lib/store/ui";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export function CommandPalette() {
  const ui = useUi();
  const router = useRouter();
  const engine = useEngine();
  const close = () => setUi({ paletteOpen: false });
  return (
    <CommandDialog open={ui.paletteOpen} onOpenChange={(o) => setUi({ paletteOpen: o })} label="Paleta de comandos">
      <CommandInput placeholder="Ir a un módulo o ejecutar una acción…" />
      <CommandList>
        <CommandEmpty className="px-3 py-6 text-center text-[12px] text-muted">Sin resultados.</CommandEmpty>
        <CommandGroup heading="Módulos">
          <CommandItem
            onSelect={() => {
              router.push("/");
              close();
            }}
          >
            <CommandIcon size={14} className="text-muted" /> Torre de control
          </CommandItem>
          {MODULES.map((m) => (
            <CommandItem
              key={m.id}
              value={`${m.title} ${m.short}`}
              onSelect={() => {
                router.push(m.path);
                close();
              }}
            >
              <Layers size={14} className="text-muted" /> {m.title}
              <span className="ml-auto text-[11px] text-dim">{m.short}</span>
            </CommandItem>
          ))}
          <CommandItem
            onSelect={() => {
              router.push("/arena");
              close();
            }}
          >
            <Layers size={14} className="text-muted" /> Model bench
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Acciones">
          <CommandItem
            onSelect={() => {
              setUi({ reelActive: !getUi().reelActive });
              close();
            }}
          >
            <Film size={14} className="text-muted" /> {ui.reelActive ? "Detener demo reel" : "Iniciar demo reel"}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              engine.toggle();
              close();
            }}
          >
            {engine.playing ? <Pause size={14} className="text-muted" /> : <Play size={14} className="text-muted" />}
            {engine.playing ? "Pausar simulación" : "Reanudar simulación"}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setUi({ chromeHidden: !getUi().chromeHidden });
              close();
            }}
          >
            <EyeOff size={14} className="text-muted" /> {ui.chromeHidden ? "Mostrar chrome" : "Ocultar chrome"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
