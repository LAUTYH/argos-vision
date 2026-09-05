import type { ModuleId } from "../types";
import type { ModuleDef } from "../world";
import { documentosDef } from "./documentos";
import { flujoDef } from "./flujo";
import { inspeccionDef } from "./inspeccion";
import { patioDef } from "./patio";
import { recepcionDef } from "./recepcion";
import { seguridadDef } from "./seguridad";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModuleDef = ModuleDef<any>;

export const MODULE_DEFS: Record<ModuleId, AnyModuleDef> = {
  recepcion: recepcionDef,
  seguridad: seguridadDef,
  flujo: flujoDef,
  patio: patioDef,
  inspeccion: inspeccionDef,
  documentos: documentosDef,
};

export const MODULE_IDS: ModuleId[] = ["recepcion", "seguridad", "flujo", "patio", "inspeccion", "documentos"];
