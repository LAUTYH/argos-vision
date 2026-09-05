"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { setUi, useUi } from "@/lib/store/ui";

const ROWS: Array<[string, string]> = [
  ["D", "Demo reel de 90 s (recorre los módulos solo)"],
  ["H", "Ocultar / mostrar chrome para capturas limpias"],
  ["S", "Ocultar / mostrar badge de datos simulados"],
  ["R", "Raw feed: quita todas las anotaciones del módulo"],
  ["Espacio", "Pausar / reanudar la simulación"],
  ["← →", "Retroceder / avanzar 5 s (Shift: 30 s)"],
  ["⌘ K", "Paleta de comandos"],
  ["?", "Esta ayuda"],
];

export function ShortcutsDialog() {
  const ui = useUi();
  return (
    <Dialog open={ui.shortcutsOpen} onOpenChange={(o) => setUi({ shortcutsOpen: o })}>
      <DialogContent title="Atajos de teclado" description="Pensados para grabar sin tocar el mouse.">
        <ul className="divide-y divide-border">
          {ROWS.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-2 text-[12px]">
              <span className="text-muted">{d}</span>
              <Kbd className="h-5 px-1.5 text-[11px]">{k}</Kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
