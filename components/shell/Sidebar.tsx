"use client";

import { FileText, FlaskConical, Footprints, HardHat, LayoutGrid, PackageCheck, Truck, Wind } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setUi, useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Torre de control", icon: LayoutGrid, key: "1" },
  { href: "/recepcion", label: "Recepción", icon: PackageCheck, key: "2" },
  { href: "/seguridad", label: "Seguridad", icon: HardHat, key: "3" },
  { href: "/flujo", label: "Flujo", icon: Footprints, key: "4" },
  { href: "/patio", label: "Patio", icon: Truck, key: "5" },
  { href: "/inspeccion", label: "Inspección", icon: Wind, key: "6" },
  { href: "/documentos", label: "Documentos", icon: FileText, key: "7" },
  { href: "/arena", label: "Model bench", icon: FlaskConical, key: "8" },
];

export function Sidebar() {
  const pathname = usePathname();
  const ui = useUi();
  const open = ui.sidebarOpen;
  return (
    <nav
      aria-label="Módulos"
      onMouseEnter={() => setUi({ sidebarOpen: true })}
      onMouseLeave={() => setUi({ sidebarOpen: false })}
      onFocus={() => setUi({ sidebarOpen: true })}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setUi({ sidebarOpen: false });
      }}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-[width] duration-200 ease-[var(--ease-spring)]",
        open ? "w-[224px]" : "w-16",
      )}
    >
      <Link href="/" className="flex h-14 items-center gap-3 border-b border-border px-[19px]" aria-label="ARGOS · inicio">
        <span className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] border border-accent/50 bg-accent/10">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="absolute inset-[6px] rounded-full border border-accent/40" />
        </span>
        <span className={cn("overflow-hidden whitespace-nowrap text-[13px] font-semibold tracking-[0.18em] text-text transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}>
          ARGOS
        </span>
      </Link>
      <ul className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-md px-[13px] text-muted transition-colors duration-150 hover:bg-white/[0.05] hover:text-text",
                  active && "bg-white/[0.04] text-text",
                )}
              >
                {active ? <span className="absolute left-0 top-2 h-6 w-[2px] rounded-full bg-accent" /> : null}
                <Icon size={18} strokeWidth={1.75} className={cn("shrink-0", active && "text-accent")} />
                <span className={cn("flex-1 overflow-hidden whitespace-nowrap text-[13px] transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}>{item.label}</span>
                <span className={cn("num text-[10px] text-dim transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}>{item.key}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={cn("border-t border-border p-3 text-[10px] leading-relaxed text-dim transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}>
        <div className="whitespace-nowrap">Vantor Group · Operaciones</div>
        <div className="whitespace-nowrap">4 sitios · 60 cámaras · TM</div>
      </div>
    </nav>
  );
}
