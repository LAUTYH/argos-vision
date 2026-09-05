import type { ModuleId, SiteId } from "@/lib/sim/types";

/**
 * Canonical data for Vantor Group. Every screen reads from here so a number
 * that appears twice always matches.
 */

export interface Site {
  id: SiteId;
  name: string;
  kind: string;
  location: string;
  cameras: number;
  modules: ModuleId[];
}

export const SITES: Site[] = [
  {
    id: "cd-norte",
    name: "CD Norte",
    kind: "Centro de distribución",
    location: "Pacheco, Buenos Aires",
    cameras: 24,
    modules: ["recepcion", "flujo", "documentos"],
  },
  {
    id: "planta-rosario",
    name: "Planta Rosario",
    kind: "Manufactura",
    location: "Rosario, Santa Fe",
    cameras: 18,
    modules: ["seguridad"],
  },
  {
    id: "parque-vega",
    name: "Parque Vega",
    kind: "Activos remotos · eólico",
    location: "Bahía Blanca, Buenos Aires",
    cameras: 6,
    modules: ["inspeccion"],
  },
  {
    id: "terminal-sur",
    name: "Terminal Sur",
    kind: "Patio de camiones",
    location: "Dock Sud, Avellaneda",
    cameras: 12,
    modules: ["patio"],
  },
];

export const SITE_BY_ID: Record<SiteId, Site> = Object.fromEntries(
  SITES.map((s) => [s.id, s]),
) as Record<SiteId, Site>;

export interface ModuleMeta {
  id: ModuleId;
  path: string;
  title: string;
  short: string;
  subtitle: string;
  site: SiteId;
  camera: string;
}

export const MODULES: ModuleMeta[] = [
  {
    id: "recepcion",
    path: "/recepcion",
    title: "Conteo de recepción",
    short: "Recepción",
    subtitle: "Conteo por SKU contra remito esperado",
    site: "cd-norte",
    camera: "CAM-03 · Muelle 2 · Cinta B",
  },
  {
    id: "seguridad",
    path: "/seguridad",
    title: "EPP y zonas de riesgo",
    short: "Seguridad",
    subtitle: "Pose, casco y chaleco · zona restringida Prensas",
    site: "planta-rosario",
    camera: "CAM-11 · Nave 2 · Línea de prensas",
  },
  {
    id: "flujo",
    path: "/flujo",
    title: "Flujo de personas",
    short: "Flujo",
    subtitle: "Tracking con ID persistente · aforo y permanencia",
    site: "cd-norte",
    camera: "CAM-07 · Picking · Pasillo central",
  },
  {
    id: "patio",
    path: "/patio",
    title: "Yard y autoelevadores",
    short: "Patio",
    subtitle: "Vista cenital · trayectorias, riesgo de cruce, dársenas",
    site: "terminal-sur",
    camera: "CAM-01 · Mástil norte · Cenital",
  },
  {
    id: "inspeccion",
    path: "/inspeccion",
    title: "Inspección de activos",
    short: "Inspección",
    subtitle: "Segmentación de defectos en palas",
    site: "parque-vega",
    camera: "DRON-02 · Pasada pala · 4K",
  },
  {
    id: "documentos",
    path: "/documentos",
    title: "OCR y remitos",
    short: "Documentos",
    subtitle: "Grounding de campos · cruce con recepción",
    site: "cd-norte",
    camera: "SCAN-01 · Oficina de recepción",
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleMeta> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleMeta>;

/** Simulated wall clock: the session starts at this time and advances with sim time. */
export const SIM_START = { hour: 9, minute: 41, second: 0 };
export const SIM_DATE = "jue 04 sep 2026";
export const SIM_DATE_SHORT = "04/09/2026";
export const SHIFT = { code: "TM", label: "Turno mañana", range: "06:00–14:00" };

export function simClock(t: number): string {
  const total = SIM_START.hour * 3600 + SIM_START.minute * 60 + SIM_START.second + Math.floor(t);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function simClockShort(t: number): string {
  return simClock(t).slice(0, 5);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export interface Sku {
  code: string;
  name: string;
  /** Dimensions in metres. */
  dims: { w: number; h: number; d: number };
  tone: number;
}

export const SKUS: Sku[] = [
  { code: "VG-1042", name: "Filtro hidráulico HF-35", dims: { w: 0.42, h: 0.3, d: 0.32 }, tone: 0.55 },
  { code: "VG-2210", name: "Rodamiento 6205-2RS x24", dims: { w: 0.34, h: 0.22, d: 0.26 }, tone: 0.42 },
  { code: "VG-3308", name: "Correa dentada 8M-1440", dims: { w: 0.5, h: 0.18, d: 0.5 }, tone: 0.65 },
  { code: "VG-4115", name: "Válvula solenoide 24V", dims: { w: 0.3, h: 0.26, d: 0.3 }, tone: 0.35 },
  { code: "VG-5520", name: "Aceite ISO VG 68 · 20 L", dims: { w: 0.3, h: 0.4, d: 0.3 }, tone: 0.25 },
  { code: "VG-6031", name: "Guante nitrilo T9 x100", dims: { w: 0.46, h: 0.24, d: 0.36 }, tone: 0.72 },
];

/** A SKU that shows up on the belt but is not declared on the active remito. */
export const SKU_UNDECLARED: Sku = {
  code: "VG-7781",
  name: 'Manguera hidráulica R2 1/2"',
  dims: { w: 0.44, h: 0.2, d: 0.44 },
  tone: 0.48,
};

export const SKU_BY_CODE: Record<string, Sku> = Object.fromEntries(
  [...SKUS, SKU_UNDECLARED].map((s) => [s.code, s]),
);

export interface RemitoLine {
  sku: string;
  expected: number;
  /** Units physically present on the truck (drives faltantes/sobrantes). */
  actual: number;
}

export interface Remito {
  number: string;
  date: string;
  supplier: string;
  cuit: string;
  origin: string;
  carrier: string;
  plate: string;
  driver: string;
  dock: string;
  lines: RemitoLine[];
  /** Units already counted when the session starts (the truck began unloading earlier). */
  preCounted: Record<string, number>;
  /** Extra undeclared units mixed in the load. */
  undeclared: number;
}

export const REMITOS: Remito[] = [
  {
    number: "0001-00048213",
    date: SIM_DATE_SHORT,
    supplier: "Distribuidora Litoral S.A.",
    cuit: "30-71234567-8",
    origin: "Depósito Rosario · Ruta 34 km 12",
    carrier: "Transportes Bragado S.R.L.",
    plate: "AF 412 KL",
    driver: "H. Cáceres",
    dock: "Muelle 2",
    lines: [
      { sku: "VG-1042", expected: 48, actual: 48 },
      { sku: "VG-2210", expected: 36, actual: 32 },
      { sku: "VG-3308", expected: 24, actual: 24 },
      { sku: "VG-4115", expected: 60, actual: 60 },
      { sku: "VG-5520", expected: 12, actual: 14 },
      { sku: "VG-6031", expected: 30, actual: 30 },
    ],
    preCounted: {
      "VG-1042": 41,
      "VG-2210": 27,
      "VG-3308": 19,
      "VG-4115": 46,
      "VG-5520": 8,
      "VG-6031": 21,
    },
    undeclared: 1,
  },
  {
    number: "0001-00048214",
    date: SIM_DATE_SHORT,
    supplier: "Metalúrgica Andina S.A.",
    cuit: "30-65432198-1",
    origin: "Planta Villa Mercedes · San Luis",
    carrier: "Logística del Centro",
    plate: "AE 908 MN",
    driver: "R. Villalba",
    dock: "Muelle 2",
    lines: [
      { sku: "VG-4115", expected: 40, actual: 40 },
      { sku: "VG-2210", expected: 24, actual: 24 },
      { sku: "VG-1042", expected: 36, actual: 35 },
      { sku: "VG-3308", expected: 18, actual: 18 },
    ],
    preCounted: {},
    undeclared: 0,
  },
];

export const OPERATORS = [
  { name: "M. Ledesma", role: "Operario prensas" },
  { name: "J. Ortiz", role: "Supervisor de nave" },
  { name: "R. Acuña", role: "Mantenimiento" },
  { name: "S. Benítez", role: "Operaria prensas" },
  { name: "L. Ferreyra", role: "Calidad" },
  { name: "D. Quiroga", role: "Logística interna" },
  { name: "A. Sosa", role: "Operario" },
  { name: "V. Peralta", role: "Picking" },
  { name: "C. Molina", role: "Picking" },
  { name: "N. Giménez", role: "Packing" },
  { name: "P. Ibáñez", role: "Picking" },
  { name: "F. Rojas", role: "Supervisor CD" },
  { name: "G. Farías", role: "Muelle" },
  { name: "E. Luna", role: "Packing" },
] as const;

export const FORKLIFTS = [
  { code: "MC-01", operator: "T. Navarro" },
  { code: "MC-02", operator: "B. Suárez" },
  { code: "MC-03", operator: "I. Castro" },
  { code: "MC-04", operator: "O. Ramos" },
] as const;

export const TRUCK_PLATES = [
  "AD 331 RT",
  "AE 908 MN",
  "AC 117 ZA",
  "AB 654 PQ",
  "AF 220 GH",
  "AD 875 LM",
  "AE 043 XY",
  "AC 590 KJ",
] as const;

export const DOCK_COUNT = 8;

/**
 * The runtime this console pretends to be talking to. The bench screen reports
 * single-GPU, batch-1 figures from the paper; a deployment that serves six
 * live cameras batches frames across streams and runs on several GPUs, which
 * is why the aggregate rate on the tower is much higher than 12.7 boxes/s.
 */
export const RUNTIME = {
  fleet: "4 × H100 80 GB",
  precision: "BF16",
  mode: "hybrid",
  batching: "batch por lote de cámaras",
  note: "Las cifras del Model bench son de una H100 con batch 1, tal como se publican. Los feeds simulan un despliegue con varias GPU y batching entre cámaras.",
};

export interface WindAsset {
  id: string;
  model: string;
  lastInspection: string;
  hours: number;
}

export const WIND_ASSETS: WindAsset[] = [
  { id: "WTG-01", model: "VG-136 · 4.2 MW", lastInspection: "12/08/2026", hours: 41230 },
  { id: "WTG-02", model: "VG-136 · 4.2 MW", lastInspection: "12/08/2026", hours: 41180 },
  { id: "WTG-03", model: "VG-136 · 4.2 MW", lastInspection: "13/08/2026", hours: 40955 },
  { id: "WTG-04", model: "VG-136 · 4.2 MW", lastInspection: "13/08/2026", hours: 40870 },
  { id: "WTG-05", model: "VG-136 · 4.2 MW", lastInspection: "19/08/2026", hours: 39640 },
  { id: "WTG-06", model: "VG-136 · 4.2 MW", lastInspection: "19/08/2026", hours: 39602 },
  { id: "WTG-07", model: "VG-136 · 4.2 MW", lastInspection: SIM_DATE_SHORT, hours: 38915 },
  { id: "WTG-08", model: "VG-136 · 4.2 MW", lastInspection: SIM_DATE_SHORT, hours: 38880 },
  { id: "WTG-09", model: "VG-150 · 5.6 MW", lastInspection: "26/08/2026", hours: 22410 },
  { id: "WTG-10", model: "VG-150 · 5.6 MW", lastInspection: "26/08/2026", hours: 22395 },
  { id: "WTG-11", model: "VG-150 · 5.6 MW", lastInspection: "27/08/2026", hours: 22100 },
  { id: "WTG-12", model: "VG-150 · 5.6 MW", lastInspection: "27/08/2026", hours: 22088 },
];

export const DEFECT_LABEL: Record<string, string> = {
  erosion: "Erosión borde de ataque",
  grieta: "Grieta transversal",
  delaminacion: "Delaminación",
  rayo: "Impacto de rayo",
  pintura: "Pintura desprendida",
};
