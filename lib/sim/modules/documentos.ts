import { REMITOS, SKU_BY_CODE, type Remito } from "@/lib/data/company";
import type { Entity, FieldEntity, Kpi, Observable, Zone } from "../types";
import type { InitCtx, ModuleDef, StepCtx, WorldState } from "../world";

/**
 * Document grounding. The feed shows the remito as it comes out of the
 * office scanner; the fields are the entities the model localises.
 * Layout is shared with the renderer so boxes always sit on the text.
 */
export const DOC = { x: 262, y: 28, w: 756, h: 664 };

export interface DocLayoutField {
  field: string;
  label: string;
  value: string;
  box: { x: number; y: number; w: number; h: number };
  group: "cabecera" | "item" | "pie";
  row: number;
}

/** Field boxes in document-normalised coordinates (0..1). */
export function layoutRemito(remito: Remito): DocLayoutField[] {
  const f: DocLayoutField[] = [];
  const header = (field: string, label: string, value: string, x: number, y: number, w: number) =>
    f.push({ field, label, value, box: { x, y, w, h: 0.028 }, group: "cabecera", row: -1 });
  header("numero", "N° remito", remito.number, 0.62, 0.075, 0.3);
  header("fecha", "Fecha", remito.date, 0.62, 0.118, 0.2);
  header("proveedor", "Proveedor", remito.supplier, 0.07, 0.19, 0.46);
  header("cuit", "CUIT", remito.cuit, 0.07, 0.228, 0.26);
  header("origen", "Origen", remito.origin, 0.07, 0.266, 0.5);
  header("transporte", "Transporte", remito.carrier, 0.07, 0.318, 0.42);
  header("patente", "Patente", remito.plate, 0.62, 0.318, 0.18);
  header("chofer", "Chofer", remito.driver, 0.62, 0.356, 0.22);
  const y0 = 0.45;
  const rowH = 0.048;
  remito.lines.forEach((line, i) => {
    const y = y0 + i * rowH;
    const sku = SKU_BY_CODE[line.sku];
    f.push({ field: "sku", label: "SKU", value: line.sku, box: { x: 0.07, y, w: 0.15, h: 0.028 }, group: "item", row: i });
    f.push({ field: "descripcion", label: "Descripción", value: sku?.name ?? line.sku, box: { x: 0.25, y, w: 0.46, h: 0.028 }, group: "item", row: i });
    f.push({ field: "cantidad", label: "Cantidad", value: String(line.expected), box: { x: 0.8, y, w: 0.12, h: 0.028 }, group: "item", row: i });
  });
  const total = remito.lines.reduce((a, l) => a + l.expected, 0);
  f.push({ field: "total", label: "Total unidades", value: String(total), box: { x: 0.74, y: 0.78, w: 0.18, h: 0.03 }, group: "pie", row: -1 });
  f.push({ field: "firma", label: "Firma", value: "firma manuscrita", box: { x: 0.08, y: 0.86, w: 0.24, h: 0.08 }, group: "pie", row: -1 });
  f.push({ field: "aclaracion", label: "Aclaración", value: "G. Farías · Muelle", box: { x: 0.08, y: 0.945, w: 0.24, h: 0.026 }, group: "pie", row: -1 });
  return f;
}

export interface DocumentosData {
  docIdx: number;
  docSince: number;
  processedToday: number;
}

function fieldsOf(ctx: InitCtx | StepCtx, idx: number): FieldEntity[] {
  const remito = REMITOS[idx % REMITOS.length];
  if (!remito) return [];
  return layoutRemito(remito).map((f) => ({
    kind: "campo",
    id: ctx.id(),
    trackId: ctx.track(),
    born: 0,
    field: f.field,
    label: f.label,
    value: f.value,
    box: f.box,
    group: f.group,
    row: f.row,
  }));
}

function init(ctx: InitCtx): { data: DocumentosData; entities: Entity[] } {
  return { data: { docIdx: 0, docSince: 0, processedToday: 14 }, entities: fieldsOf(ctx, 0) };
}

export function activeDocument(state: WorldState<DocumentosData>): Remito {
  const r = REMITOS[state.data.docIdx % REMITOS.length];
  if (!r) throw new Error("no remito");
  return r;
}

function step(state: WorldState<DocumentosData>, ctx: StepCtx): void {
  // The office scans the next remito once the previous truck is done; keep
  // the active document aligned with /recepcion (same remito index cadence).
  const d = state.data;
  const DOC_CYCLE = 130;
  if (ctx.t - d.docSince >= DOC_CYCLE && d.docIdx < REMITOS.length - 1) {
    d.docIdx += 1;
    d.docSince = ctx.t;
    d.processedToday += 1;
    state.entities = fieldsOf(ctx, d.docIdx);
    const r = activeDocument(state);
    ctx.emit({ severity: "info", kind: "doc", title: `Remito ${r.number} digitalizado`, detail: `${r.supplier} · ${state.entities.length} campos extraídos en una pasada` });
  }
}

function observe(state: WorldState<DocumentosData>): Observable[] {
  const items: Observable[] = [];
  for (const e of state.entities) {
    if (e.kind !== "campo") continue;
    items.push({
      entityId: e.id,
      trackId: e.trackId,
      kind: "campo",
      box: { x: DOC.x + e.box.x * DOC.w, y: DOC.y + e.box.y * DOC.h, w: e.box.w * DOC.w, h: e.box.h * DOC.h },
      depth: 0.05,
      occlusion: 0,
      attrs: { field: e.field, fieldLabel: e.label, value: e.value, group: e.group },
    });
  }
  return items;
}

function zones(): Zone[] {
  return [];
}

function kpis(state: WorldState<DocumentosData>): Kpi[] {
  const fields = state.entities.filter((e) => e.kind === "campo").length;
  return [
    { id: "docs", label: "Documentos · hoy", value: state.data.processedToday, decimals: 0 },
    { id: "fields", label: "Campos extraídos", value: fields, decimals: 0 },
  ];
}

export const documentosDef: ModuleDef<DocumentosData> = {
  id: "documentos",
  site: "cd-norte",
  init,
  step,
  observe,
  zones,
  kpis,
};
