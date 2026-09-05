import type { Box, DetectionStatus, ModuleId, Observable } from "./types";

/**
 * Detection classes. A class is a natural-language concept the prompt bar can
 * ask for. Each one has a stable colour slot, a shape (how the annotation layer
 * draws it) and a matcher over what the camera can see.
 */

/** Eight categorical colours tuned for the dark surface; index is stable per class. */
export const CLASS_PALETTE = [
  "#6FA8FF",
  "#FF8A65",
  "#C792EA",
  "#4DD4AC",
  "#FFD166",
  "#F48FB1",
  "#E0C9A6",
  "#9FB3C8",
] as const;

export type Shape = "box" | "mask" | "pose" | "point";

export interface ClassSpec {
  key: string;
  label: string;
  colorIndex: number;
  shape: Shape;
  modules: ModuleId[];
  /** Whether the class is on by default when the module opens. */
  base: boolean;
  synonyms: string[];
  match: (o: Observable) => boolean;
  boxOf?: (o: Observable) => Box | undefined;
  status?: (o: Observable) => DetectionStatus;
  sub?: (o: Observable) => string | undefined;
  /**
   * Whether the annotation layer draws a label chip. Attribute classes that
   * sit inside another box (a helmet on a person) are drawn as a plain box so
   * the frame does not fill with stacked labels.
   */
  chip?: boolean;
  /** Suggested prompt text shown as a chip under the bar. */
  suggest?: string;
}

const persons: ModuleId[] = ["seguridad", "flujo", "patio"];

export const CLASSES: ClassSpec[] = [
  // ── Recepción ────────────────────────────────────────────────────────────
  {
    key: "caja",
    label: "caja",
    colorIndex: 0,
    shape: "box",
    modules: ["recepcion"],
    base: true,
    synonyms: ["caja", "cajas", "bulto", "bultos", "paquete", "paquetes", "box"],
    match: (o) => o.kind === "caja",
    status: (o) => (o.attrs.expected === false ? "alert" : "ok"),
    sub: (o) => o.attrs.sku,
  },
  {
    key: "caja_danada",
    label: "caja dañada",
    colorIndex: 1,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["caja danada", "caja rota", "caja golpeada", "caja aplastada", "bulto danado", "danada", "damaged box"],
    match: (o) => o.kind === "caja" && o.attrs.damaged === true,
    status: () => "warn",
    sub: (o) => o.attrs.sku,
    suggest: "caja dañada",
  },
  {
    key: "caja_abierta",
    label: "caja abierta",
    colorIndex: 4,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["caja abierta", "caja sin cerrar", "abierta", "open box"],
    match: (o) => o.kind === "caja" && o.attrs.open === true,
    status: () => "warn",
    sub: (o) => o.attrs.sku,
    suggest: "caja abierta",
  },
  {
    key: "bulto",
    label: "bulto",
    colorIndex: 3,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["bulto", "bultos", "paquete envuelto", "bolsa", "parcel"],
    match: () => false,
    suggest: "bulto",
  },
  {
    key: "pallet",
    label: "pallet",
    colorIndex: 6,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["pallet", "pallets", "palet", "tarima"],
    match: (o) => o.kind === "pallet",
    sub: (o) => (o.attrs.film ? "con film" : "sin film"),
    suggest: "pallet",
  },
  {
    key: "pallet_sin_film",
    label: "pallet sin film",
    colorIndex: 5,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["pallet sin film", "pallet sin envolver", "sin film", "pallet sin stretch", "palet sin film"],
    match: (o) => o.kind === "pallet" && o.attrs.film === false,
    status: () => "warn",
    suggest: "pallet sin film",
  },
  {
    key: "etiqueta",
    label: "etiqueta",
    colorIndex: 2,
    shape: "box",
    modules: ["recepcion"],
    base: false,
    synonyms: ["etiqueta", "etiquetas", "rotulo", "label"],
    match: (o) => o.kind === "caja" && o.depth < 0.75,
    boxOf: (o) => ({
      x: o.box.x + o.box.w * 0.18,
      y: o.box.y + o.box.h * 0.46,
      w: o.box.w * 0.3,
      h: o.box.h * 0.2,
    }),
    chip: false,
    suggest: "etiqueta",
  },
  // ── Personas ─────────────────────────────────────────────────────────────
  {
    key: "persona",
    label: "persona",
    colorIndex: 0,
    shape: "pose",
    modules: ["seguridad"],
    base: true,
    synonyms: ["persona", "personas", "operario", "operarios", "trabajador", "gente", "operador", "person", "people"],
    match: (o) => o.kind === "persona",
    status: (o) => (o.attrs.restricted ? "alert" : o.attrs.helmet === false || o.attrs.vest === false ? "warn" : "ok"),
    sub: (o) => o.attrs.name,
  },
  {
    key: "persona",
    label: "persona",
    colorIndex: 0,
    shape: "box",
    modules: ["flujo", "patio"],
    base: true,
    synonyms: ["persona", "personas", "operario", "operarios", "trabajador", "gente", "peaton", "peatones", "person", "people"],
    match: (o) => o.kind === "persona",
    status: (o) => (o.attrs.inPedestrian === false && o.kind === "persona" ? "warn" : "ok"),
    sub: (o) => o.attrs.zone ?? undefined,
  },
  {
    key: "casco",
    label: "casco",
    colorIndex: 4,
    shape: "box",
    modules: ["seguridad"],
    base: true,
    synonyms: ["casco", "cascos", "helmet"],
    match: (o) => o.kind === "persona" && o.attrs.helmet === true && o.head !== undefined,
    boxOf: (o) => o.head,
    chip: false,
  },
  {
    key: "chaleco",
    label: "chaleco",
    colorIndex: 1,
    shape: "box",
    modules: ["seguridad"],
    base: true,
    synonyms: ["chaleco", "chalecos", "chaleco reflectivo", "vest"],
    match: (o) => o.kind === "persona" && o.attrs.vest === true && o.torso !== undefined,
    boxOf: (o) => o.torso,
    chip: false,
  },
  {
    key: "persona_sin_casco",
    label: "persona sin casco",
    colorIndex: 5,
    shape: "box",
    modules: persons,
    base: false,
    synonyms: ["persona sin casco", "sin casco", "operario sin casco", "trabajador sin casco", "no helmet"],
    match: (o) => o.kind === "persona" && o.attrs.helmet === false,
    status: () => "alert",
    sub: (o) => o.attrs.name,
    suggest: "persona sin casco",
  },
  {
    key: "persona_sin_chaleco",
    label: "persona sin chaleco",
    colorIndex: 2,
    shape: "box",
    modules: persons,
    base: false,
    synonyms: ["persona sin chaleco", "sin chaleco", "operario sin chaleco", "no vest"],
    match: (o) => o.kind === "persona" && o.attrs.vest === false,
    status: () => "warn",
    sub: (o) => o.attrs.name,
    suggest: "persona sin chaleco",
  },
  {
    key: "persona_zona_restringida",
    label: "persona en zona restringida",
    colorIndex: 3,
    shape: "box",
    modules: ["seguridad"],
    base: false,
    synonyms: ["persona en zona restringida", "zona restringida", "ingreso a zona restringida", "en zona restringida"],
    match: (o) => o.kind === "persona" && o.attrs.restricted === true,
    status: () => "alert",
    sub: (o) => o.attrs.name,
    suggest: "persona en zona restringida",
  },
  // ── Patio ────────────────────────────────────────────────────────────────
  {
    key: "montacarga",
    label: "montacarga",
    colorIndex: 4,
    shape: "box",
    modules: ["patio"],
    base: true,
    synonyms: ["montacarga", "montacargas", "autoelevador", "autoelevadores", "clark", "forklift"],
    match: (o) => o.kind === "montacarga",
    status: (o) => (o.attrs.inPedestrian ? "alert" : o.attrs.wrongWay ? "warn" : "ok"),
    sub: (o) => o.attrs.code,
  },
  {
    key: "auto",
    label: "auto",
    colorIndex: 2,
    shape: "box",
    modules: ["patio"],
    base: false,
    synonyms: ["auto", "autos", "coche", "coches", "vehiculo liviano", "car"],
    // Only the real yard clip contains cars; the simulated yard has none.
    match: () => false,
    suggest: "auto",
  },
  {
    key: "camion",
    label: "camión",
    colorIndex: 6,
    shape: "box",
    modules: ["patio"],
    base: true,
    synonyms: ["camion", "camiones", "semi", "trailer", "truck"],
    match: (o) => o.kind === "camion",
    sub: (o) => o.attrs.plate,
  },
  {
    key: "montacarga_contramano",
    label: "montacarga en contramano",
    colorIndex: 1,
    shape: "box",
    modules: ["patio"],
    base: false,
    synonyms: ["montacarga en contramano", "en contramano", "contramano", "autoelevador en contramano"],
    match: (o) => o.kind === "montacarga" && o.attrs.wrongWay === true,
    status: () => "warn",
    sub: (o) => o.attrs.code,
    suggest: "montacarga en contramano",
  },
  {
    key: "montacarga_zona_peatonal",
    label: "montacarga en zona peatonal",
    colorIndex: 5,
    shape: "box",
    modules: ["patio"],
    base: false,
    synonyms: ["montacarga en zona peatonal", "en zona peatonal", "zona peatonal", "autoelevador en senda"],
    match: (o) => o.kind === "montacarga" && o.attrs.inPedestrian === true,
    status: () => "alert",
    sub: (o) => o.attrs.code,
    suggest: "montacarga en zona peatonal",
  },
  {
    key: "montacarga_con_carga",
    label: "montacarga con carga",
    colorIndex: 2,
    shape: "box",
    modules: ["patio"],
    base: false,
    synonyms: ["montacarga con carga", "con carga", "cargado", "montacarga cargado"],
    match: (o) => o.kind === "montacarga" && o.attrs.carrying === true,
    sub: (o) => o.attrs.code,
    suggest: "montacarga con carga",
  },
  {
    key: "camion_en_darsena",
    label: "camión en dársena",
    colorIndex: 3,
    shape: "box",
    modules: ["patio"],
    base: false,
    synonyms: ["camion en darsena", "en darsena", "camion atracado", "camion descargando"],
    match: (o) => o.kind === "camion" && o.attrs.state === "docked",
    sub: (o) => (o.attrs.dock !== undefined && o.attrs.dock >= 0 ? `D${o.attrs.dock + 1}` : undefined),
    suggest: "camión en dársena",
  },
  // ── Inspección ───────────────────────────────────────────────────────────
  {
    key: "defecto",
    label: "defecto",
    colorIndex: 1,
    shape: "mask",
    modules: ["inspeccion"],
    base: true,
    synonyms: ["defecto", "defectos", "dano", "danos", "falla", "damage"],
    match: (o) => o.kind === "defecto",
    status: (o) => (o.attrs.severity === "alta" ? "alert" : o.attrs.severity === "media" ? "warn" : "ok"),
    sub: (o) => o.attrs.defectType,
  },
  {
    key: "grieta",
    label: "grieta",
    colorIndex: 5,
    shape: "mask",
    modules: ["inspeccion"],
    base: false,
    synonyms: ["grieta", "grietas", "fisura", "fisuras", "crack"],
    match: (o) => o.kind === "defecto" && o.attrs.defectType === "grieta",
    status: () => "alert",
    suggest: "grieta",
  },
  {
    key: "erosion",
    label: "erosión",
    colorIndex: 4,
    shape: "mask",
    modules: ["inspeccion"],
    base: false,
    synonyms: ["erosion", "erosion borde de ataque", "borde de ataque", "desgaste"],
    match: (o) => o.kind === "defecto" && o.attrs.defectType === "erosion",
    status: () => "warn",
    suggest: "erosión",
  },
  {
    key: "delaminacion",
    label: "delaminación",
    colorIndex: 2,
    shape: "mask",
    modules: ["inspeccion"],
    base: false,
    synonyms: ["delaminacion", "delaminado", "delamination"],
    match: (o) => o.kind === "defecto" && o.attrs.defectType === "delaminacion",
    status: () => "warn",
    suggest: "delaminación",
  },
  {
    key: "rayo",
    label: "impacto de rayo",
    colorIndex: 3,
    shape: "mask",
    modules: ["inspeccion"],
    base: false,
    synonyms: ["impacto de rayo", "rayo", "descarga", "lightning"],
    match: (o) => o.kind === "defecto" && o.attrs.defectType === "rayo",
    status: () => "alert",
    suggest: "impacto de rayo",
  },
  {
    key: "pintura",
    label: "pintura desprendida",
    colorIndex: 6,
    shape: "mask",
    modules: ["inspeccion"],
    base: false,
    synonyms: ["pintura desprendida", "pintura", "recubrimiento", "coating"],
    match: (o) => o.kind === "defecto" && o.attrs.defectType === "pintura",
    suggest: "pintura desprendida",
  },
  // ── Documentos ───────────────────────────────────────────────────────────
  {
    key: "campo",
    label: "campo",
    colorIndex: 0,
    shape: "box",
    modules: ["documentos"],
    base: true,
    synonyms: ["campo", "campos", "texto", "todos los campos", "field"],
    match: (o) => o.kind === "campo",
    sub: (o) => o.attrs.fieldLabel,
  },
  {
    key: "numero_remito",
    label: "número de remito",
    colorIndex: 4,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["numero de remito", "remito", "nro remito", "n de remito", "numero"],
    match: (o) => o.kind === "campo" && o.attrs.field === "numero",
    sub: (o) => o.attrs.value,
    suggest: "número de remito",
  },
  {
    key: "cuit",
    label: "CUIT",
    colorIndex: 2,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["cuit", "cuil", "cuit del proveedor"],
    match: (o) => o.kind === "campo" && o.attrs.field === "cuit",
    sub: (o) => o.attrs.value,
    suggest: "CUIT",
  },
  {
    key: "fecha",
    label: "fecha",
    colorIndex: 3,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["fecha", "fecha de emision", "date"],
    match: (o) => o.kind === "campo" && o.attrs.field === "fecha",
    sub: (o) => o.attrs.value,
    suggest: "fecha",
  },
  {
    key: "cantidad",
    label: "cantidad",
    colorIndex: 1,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["cantidad", "cantidades", "unidades", "qty"],
    match: (o) => o.kind === "campo" && o.attrs.field === "cantidad",
    sub: (o) => o.attrs.value,
    suggest: "cantidad",
  },
  {
    key: "sku",
    label: "código SKU",
    colorIndex: 6,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["sku", "codigo", "codigo sku", "codigo de articulo", "articulo"],
    match: (o) => o.kind === "campo" && o.attrs.field === "sku",
    sub: (o) => o.attrs.value,
    suggest: "código SKU",
  },
  {
    key: "firma",
    label: "firma",
    colorIndex: 5,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["firma", "firmas", "firma del receptor", "signature"],
    match: (o) => o.kind === "campo" && o.attrs.field === "firma",
    suggest: "firma",
  },
  {
    key: "patente",
    label: "patente",
    colorIndex: 7,
    shape: "box",
    modules: ["documentos"],
    base: false,
    synonyms: ["patente", "dominio", "chapa", "plate"],
    match: (o) => o.kind === "campo" && o.attrs.field === "patente",
    sub: (o) => o.attrs.value,
    suggest: "patente",
  },
];

export function classColor(spec: ClassSpec): string {
  return CLASS_PALETTE[spec.colorIndex % CLASS_PALETTE.length] as string;
}

export function classesFor(module: ModuleId): ClassSpec[] {
  return CLASSES.filter((c) => c.modules.includes(module));
}

export function baseClasses(module: ModuleId): ClassSpec[] {
  return classesFor(module).filter((c) => c.base);
}

export function suggestionsFor(module: ModuleId): ClassSpec[] {
  return classesFor(module).filter((c) => !c.base && c.suggest !== undefined);
}

export function classByKey(module: ModuleId, key: string): ClassSpec | undefined {
  return classesFor(module).find((c) => c.key === key);
}

export function normalizePrompt(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a natural-language prompt to a class for the given module.
 * Longest matching synonym wins so "persona sin casco" beats "persona".
 */
export function resolvePrompt(module: ModuleId, prompt: string): ClassSpec | null {
  const q = normalizePrompt(prompt);
  if (!q) return null;
  let best: ClassSpec | null = null;
  let bestScore = 0;
  for (const spec of classesFor(module)) {
    for (const syn of spec.synonyms) {
      const n = normalizePrompt(syn);
      let score = 0;
      if (q === n) score = 1000 + n.length;
      else if (q.includes(n) && (n.includes(" ") || q.split(" ").includes(n))) score = n.length;
      if (score > bestScore) {
        bestScore = score;
        best = spec;
      }
    }
  }
  return best;
}
