import type { ModuleId } from "./types";

/**
 * Scripted moments. The worlds run on their own, but these beats are pinned
 * to specific seconds so a recording tells the same story every time.
 * `every` repeats the beat so a live session keeps having things happen after
 * the first pass.
 */
export interface ScriptedEvent {
  t: number;
  module: ModuleId;
  action: string;
  every?: number;
}

export const SCRIPT_PERIOD = 180;

/** Second at which the undeclared SKU crosses the counting line in /recepcion (placed by the world at init). */
export const UNDECLARED_AT = 22;

export const SCRIPT: ScriptedEvent[] = [
  { t: 8, module: "seguridad", action: "no-helmet", every: SCRIPT_PERIOD },
  { t: 27, module: "recepcion", action: "damaged-box", every: SCRIPT_PERIOD },
  { t: 35, module: "patio", action: "forklift-pedestrian", every: SCRIPT_PERIOD },
  { t: 41, module: "seguridad", action: "restricted-entry", every: SCRIPT_PERIOD },
  { t: 45, module: "flujo", action: "surge", every: SCRIPT_PERIOD },
  { t: 58, module: "patio", action: "wrong-way", every: SCRIPT_PERIOD },
  { t: 66, module: "seguridad", action: "no-vest", every: SCRIPT_PERIOD },
  { t: 112, module: "patio", action: "forklift-pedestrian", every: SCRIPT_PERIOD },
  { t: 131, module: "recepcion", action: "damaged-box", every: SCRIPT_PERIOD },
];

export function scriptedActions(module: ModuleId, from: number, to: number): string[] {
  const out: string[] = [];
  for (const ev of SCRIPT) {
    if (ev.module !== module) continue;
    if (ev.every === undefined) {
      if (ev.t > from && ev.t <= to) out.push(ev.action);
      continue;
    }
    // occurrences at t, t+every, t+2·every ...
    const k0 = Math.max(0, Math.ceil((from - ev.t) / ev.every + 1e-9));
    const k1 = Math.floor((to - ev.t) / ev.every + 1e-9);
    for (let k = k0; k <= k1; k++) {
      const at = ev.t + k * ev.every;
      if (at > from && at <= to) out.push(ev.action);
    }
  }
  return out;
}

/** Demo reel: what the screen shows at each second of a hands-free 90 s recording. */
export type ReelAction =
  | { at: number; type: "raw"; on: boolean }
  | { at: number; type: "prompt"; text: string }
  | { at: number; type: "layer"; layer: "boxes" | "masks" | "pose" | "tracks" | "zones" | "ids" | "heat"; on: boolean }
  | { at: number; type: "focus"; target: string };

export interface ReelStep {
  at: number;
  route: string;
  title: string;
  caption: string;
  actions?: ReelAction[];
}

export const REEL_DURATION = 90;

export const REEL: ReelStep[] = [
  {
    at: 0,
    route: "/",
    title: "Torre de control",
    caption: "Cuatro sitios, una consola. Los KPIs son la suma de los módulos.",
  },
  {
    at: 7,
    route: "/seguridad",
    title: "EPP y zonas de riesgo",
    caption: "Pose + casco + chaleco. A los 8 s entra un operario sin casco.",
    actions: [
      { at: 11.5, type: "raw", on: true },
      { at: 14, type: "raw", on: false },
    ],
  },
  {
    at: 19,
    route: "/recepcion",
    title: "Conteo de recepción",
    caption: "Cuenta por SKU contra el remito. Un SKU no declarado dispara la discrepancia.",
    actions: [{ at: 25, type: "prompt", text: "caja dañada" }],
  },
  {
    at: 32,
    route: "/patio",
    title: "Yard y autoelevadores",
    caption: "Trayectorias, riesgo de cruce y ocupación de dársenas.",
    actions: [{ at: 38, type: "prompt", text: "montacarga en zona peatonal" }],
  },
  {
    at: 44,
    route: "/flujo",
    title: "Flujo de personas",
    caption: "IDs persistentes, heatmap de permanencia y línea de conteo.",
    actions: [{ at: 47, type: "layer", layer: "tracks", on: true }],
  },
  {
    at: 57,
    route: "/inspeccion",
    title: "Inspección de activos",
    caption: "Segmentación de defectos sobre la pala. Severidad y área afectada.",
    actions: [{ at: 62, type: "prompt", text: "grieta" }],
  },
  {
    at: 69,
    route: "/documentos",
    title: "OCR y remitos",
    caption: "Grounding sobre el remito y cruce con lo contado en recepción.",
    actions: [{ at: 72, type: "prompt", text: "cantidad" }],
  },
  {
    at: 79,
    route: "/arena",
    title: "Model bench",
    caption: "Parallel Box Decoding: todas las cajas en una pasada.",
  },
  {
    at: 87,
    route: "/",
    title: "Torre de control",
    caption: "Un prompt, cualquier clase, sin reentrenar.",
  },
];
