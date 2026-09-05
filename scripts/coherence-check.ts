/**
 * Cross-screen coherence: the control tower must be the real sum of the
 * modules, and the document module must line up with what the belt counted.
 * Run with `pnpm coherence:check`.
 */
import { REMITOS } from "../lib/data/company";
import { Engine } from "../lib/sim/engine";
import { activeDocument, type DocumentosData } from "../lib/sim/modules/documentos";
import { activeRemito, skuTotal, tallies, type RecepcionData } from "../lib/sim/modules/recepcion";
import { ppeCompliance } from "../lib/sim/modules/seguridad";
import { dockOccupancy } from "../lib/sim/modules/patio";
import { MODULE_IDS } from "../lib/sim/modules";
import { peopleInScene, towerKpis, unitsReceivedToday } from "../lib/sim/aggregate";
import type { WorldState } from "../lib/sim/world";

let failures = 0;
let lastUnits = 0;
function check(label: string, a: number | string, b: number | string, tol = 0): void {
  const ok = typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= tol : a === b;
  if (!ok) failures++;
  console.warn(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(52)} ${a} ${ok ? "==" : "!="} ${b}`);
}

for (const t of [12, 47, 88, 140, 220]) {
  const e = new Engine();
  for (let s = 0; s <= t; s += 1 / 60) {
    e.t = s;
    for (const m of MODULE_IDS) e.worlds[m].stepTo(s);
  }
  const kpis = towerKpis(e);
  const get = (id: string): number => kpis.find((k) => k.id === id)?.value ?? NaN;

  const rec = e.worlds.recepcion.state as WorldState<RecepcionData>;
  const doc = e.worlds.documentos.state as WorldState<DocumentosData>;
  const remito = activeRemito(rec);
  const document = activeDocument(doc);

  // The tower is compared against the KPI lists the module screens render,
  // not against the helpers it shares with them.
  const modKpi = (m: (typeof MODULE_IDS)[number], id: string): number => e.kpis(m).find((k) => k.id === id)?.value ?? NaN;

  console.warn(`\nt = ${t}s`);
  check("torre.EPP == pantalla seguridad.EPP", +get("ppe").toFixed(4), +modKpi("seguridad", "ppe").toFixed(4));
  check("torre.dársenas == pantalla patio.dársenas", get("docks"), modKpi("patio", "docks"));
  check("torre.documentos == pantalla documentos.docs", get("docs"), modKpi("documentos", "docs"));
  check("torre.defectos == pantalla inspección.defectos", get("defects"), modKpi("inspeccion", "defects"));
  check(
    "torre.personas == seguridad + flujo + patio",
    get("people"),
    modKpi("seguridad", "people") + modKpi("flujo", "people") + e.worlds.patio.state.entities.filter((x) => x.kind === "persona").length,
  );
  check("torre.alertas == eventos med/alta de 2 min", get("alerts"), e.activeAlerts());
  check("torre.EPP == helper seguridad", +get("ppe").toFixed(4), +ppeCompliance(e.worlds.seguridad.state as never).toFixed(4));
  check("torre.dársenas == helper patio", get("docks"), dockOccupancy(e.worlds.patio.state as never));
  check("torre.documentos == estado documentos", get("docs"), doc.data.processedToday);
  check("documentos.remito == recepción.remito", document.number, remito.number);
  check("torre.unidades es monotónica", get("units") >= lastUnits ? 1 : 0, 1);
  lastUnits = get("units");
  void unitsReceivedToday;
  void peopleInScene;

  // every counted unit is either on a remito line or flagged as undeclared
  const tal = tallies(rec);
  const lineSum = remito.lines.reduce((a, l) => a + skuTotal(rec, l.sku), 0);
  check("recepción: Σ por SKU == total contado", lineSum, tal.total);
  const overCount = remito.lines.filter((l) => skuTotal(rec, l.sku) > l.actual).length;
  check("recepción: ningún SKU supera lo que traía el camión", overCount, 0);
  const declared = remito.lines.reduce((a, l) => a + l.expected, 0);
  check("documentos: total del remito == suma de líneas", declared, REMITOS.find((r) => r.number === document.number)!.lines.reduce((a, l) => a + l.expected, 0));
}

console.warn(`\n${failures === 0 ? "coherencia OK" : `${failures} inconsistencias`}`);
process.exit(failures === 0 ? 0 : 1);
