import type { ModuleId } from "../types";
import { World, type ModuleDef } from "../world";
import { documentosDef, type DocumentosData } from "./documentos";
import { flujoDef, type FlujoData } from "./flujo";
import { inspeccionDef, type InspeccionData } from "./inspeccion";
import { patioDef, type PatioData } from "./patio";
import { recepcionDef, type RecepcionData } from "./recepcion";
import { seguridadDef, type SeguridadData } from "./seguridad";

/** The private state each module's world keeps. */
export interface ModuleDataMap {
  recepcion: RecepcionData;
  seguridad: SeguridadData;
  flujo: FlujoData;
  patio: PatioData;
  inspeccion: InspeccionData;
  documentos: DocumentosData;
}

/**
 * The union of every module's data. The engine holds the six worlds in one
 * homogeneous record, so it sees this union; the per-module accessors in
 * `lib/sim/aggregate.ts` narrow it back to the concrete type.
 */
export type ModuleData = ModuleDataMap[ModuleId];

/** One module definition, with its data type erased to the union above. */
export type AnyModuleDef = { [K in ModuleId]: ModuleDef<ModuleDataMap[K]> }[ModuleId];

export const MODULE_DEFS: { [K in ModuleId]: ModuleDef<ModuleDataMap[K]> } = {
  recepcion: recepcionDef,
  seguridad: seguridadDef,
  flujo: flujoDef,
  patio: patioDef,
  inspeccion: inspeccionDef,
  documentos: documentosDef,
};

export const MODULE_IDS: ModuleId[] = ["recepcion", "seguridad", "flujo", "patio", "inspeccion", "documentos"];

/**
 * Builds a module's world with its private data type erased to `ModuleData`.
 *
 * `ModuleDef<D>` mentions `D` in both argument and return position, so it is
 * invariant and no single assertion relates the concrete definition to the
 * erased one. The erasure is done once, here, instead of leaking `any` into
 * every consumer; `lib/sim/aggregate.ts` narrows the state back per module.
 */
export function createWorld(module: ModuleId, seed: number): World<ModuleData> {
  const def = MODULE_DEFS[module] as unknown as ModuleDef<ModuleData>;
  return new World(def, seed);
}
