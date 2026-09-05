import { REMITOS } from "@/lib/data/company";
import type { Engine } from "./engine";
import type { DocumentosData } from "./modules/documentos";
import type { FlujoData } from "./modules/flujo";
import { passStats, type InspeccionData } from "./modules/inspeccion";
import { dockOccupancy, type PatioData } from "./modules/patio";
import { activeRemito, skuTotal, type RecepcionData } from "./modules/recepcion";
import { ppeCompliance, type SeguridadData } from "./modules/seguridad";
import { MODULE_IDS } from "./modules";
import type { Kpi, ModuleId, SiteId } from "./types";
import type { WorldState } from "./world";

/**
 * Control-tower numbers. Every value here is computed from the module worlds
 * with the same helpers the module screens use, so the tower can never
 * disagree with a module.
 */

export function recepcionState(e: Engine): WorldState<RecepcionData> {
  return e.worlds.recepcion.state as WorldState<RecepcionData>;
}
export function seguridadState(e: Engine): WorldState<SeguridadData> {
  return e.worlds.seguridad.state as WorldState<SeguridadData>;
}
export function flujoState(e: Engine): WorldState<FlujoData> {
  return e.worlds.flujo.state as WorldState<FlujoData>;
}
export function patioState(e: Engine): WorldState<PatioData> {
  return e.worlds.patio.state as WorldState<PatioData>;
}
export function inspeccionState(e: Engine): WorldState<InspeccionData> {
  return e.worlds.inspeccion.state as WorldState<InspeccionData>;
}
export function documentosState(e: Engine): WorldState<DocumentosData> {
  return e.worlds.documentos.state as WorldState<DocumentosData>;
}

/** Units counted in the shift: completed remitos plus the active one (pre-counted + live). */
export function unitsReceivedToday(e: Engine): number {
  const s = recepcionState(e);
  let units = 0;
  for (const h of s.data.history) units += h.units + h.undeclared;
  // A finished truck is already in `history`; counting the still-active tally
  // as well would book its units twice until the next truck starts.
  if (!s.data.done) {
    const remito = activeRemito(s);
    for (const line of remito.lines) units += skuTotal(s, line.sku);
    units += Object.values(s.data.unexpected).reduce((a, b) => a + b, 0);
  }
  // remitos closed earlier in the shift, before the session started
  return units + SHIFT_UNITS_BEFORE_SESSION;
}

/** Units booked earlier in the shift, before this session's clip starts. */
export const SHIFT_UNITS_BEFORE_SESSION = 1284;

export function peopleInScene(e: Engine): number {
  let n = 0;
  for (const m of ["seguridad", "flujo", "patio"] as ModuleId[]) {
    for (const ent of e.worlds[m].state.entities) if (ent.kind === "persona") n++;
  }
  return n;
}

export function detectionsPerSecond(e: Engine): number {
  let n = 0;
  for (const m of MODULE_IDS) n += e.telemetry[m].boxesPerSec;
  return n;
}

export function meanLatency(e: Engine): number {
  let sum = 0;
  let k = 0;
  for (const m of MODULE_IDS) {
    const t = e.telemetry[m];
    if (t.fps > 0) {
      sum += t.latencyMs;
      k++;
    }
  }
  return k ? sum / k : 0;
}

export function alertsForSite(e: Engine, site: SiteId, windowSeconds = 120): number {
  let n = 0;
  const from = e.t - windowSeconds;
  for (const m of MODULE_IDS) {
    for (const ev of e.worlds[m].state.events) {
      if (ev.site === site && ev.t >= from && (ev.severity === "high" || ev.severity === "medium")) n++;
    }
  }
  return n;
}

export function towerKpis(e: Engine): Kpi[] {
  const seg = seguridadState(e);
  const pat = patioState(e);
  const ins = inspeccionState(e);
  const doc = documentosState(e);
  const compliance = ppeCompliance(seg);
  const alerts = e.activeAlerts();
  const stats = passStats(ins);
  return [
    { id: "dps", label: "Detecciones / s", value: detectionsPerSecond(e), unit: "boxes/s", decimals: 0, hint: "Σ de los 6 feeds · 4×H100" },
    { id: "latency", label: "Latencia media", value: meanLatency(e), unit: "ms", decimals: 0, hint: "media de los 6 feeds" },
    { id: "alerts", label: "Alertas activas", value: alerts, decimals: 0, status: alerts > 0 ? "alert" : "ok", hint: "severidad media/alta · últimos 2 min" },
    { id: "people", label: "Personas en escena", value: peopleInScene(e), decimals: 0, hint: "seguridad + flujo + patio" },
    { id: "units", label: "Unidades recibidas · turno", value: unitsReceivedToday(e), unit: "u", decimals: 0, hint: `remito ${activeRemito(recepcionState(e)).number} en curso` },
    { id: "ppe", label: "Cumplimiento EPP", value: compliance, unit: "%", decimals: 1, status: compliance < 95 ? "warn" : "ok", hint: "Planta Rosario · Nave 2" },
    { id: "docks", label: "Dársenas ocupadas", value: dockOccupancy(pat), unit: "/ 8", decimals: 0, hint: "Terminal Sur" },
    { id: "defects", label: "Defectos en pasada", value: stats.seen.length, decimals: 0, status: stats.max === "alta" ? "alert" : "ok", hint: `Parque Vega · ${ins.entities.length ? "pasada en curso" : "sin pasada"}` },
    { id: "docs", label: "Documentos · hoy", value: doc.data.processedToday, decimals: 0, hint: `${REMITOS.length} remitos en cola` },
  ];
}
