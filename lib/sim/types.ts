/** Shared simulation types. Everything here is plain data so world state can be structured-cloned. */

export type ModuleId =
  | "recepcion"
  | "seguridad"
  | "flujo"
  | "patio"
  | "inspeccion"
  | "documentos";

export type SiteId = "cd-norte" | "planta-rosario" | "parque-vega" | "terminal-sur";

export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned box in scene pixels (top-left origin). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Severity = "info" | "low" | "medium" | "high";

export interface SimEvent {
  id: number;
  t: number;
  module: ModuleId;
  site: SiteId;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  entityId?: number;
}

export type EntityKind =
  | "caja"
  | "pallet"
  | "persona"
  | "montacarga"
  | "camion"
  | "defecto"
  | "campo";

interface EntityBase {
  id: number;
  /** Tracker-assigned id; can flicker to a new value on rare frames. */
  trackId: number;
  born: number;
}

export interface BoxEntity extends EntityBase {
  kind: "caja";
  /** Progress along the belt, 0 = far end, 1 = exit. */
  s: number;
  speed: number;
  sku: string;
  expected: boolean;
  damaged: boolean;
  open: boolean;
  counted: boolean;
  /** Box dimensions in metres (w along belt, h up, d across). */
  dims: { w: number; h: number; d: number };
  tone: number;
  lateral: number;
  yaw: number;
}

export interface PalletEntity extends EntityBase {
  kind: "pallet";
  pos: Vec2;
  film: boolean;
  layers: number;
  tone: number;
}

export interface Waypoint extends Vec2 {
  dwell?: number;
}

export interface PersonEntity extends EntityBase {
  kind: "persona";
  /** Floor position in metres: x lateral, y depth (perspective) or yard y (top-down). */
  pos: Vec2;
  heading: number;
  speed: number;
  targetSpeed: number;
  gait: number;
  height: number;
  helmet: boolean;
  vest: boolean;
  name: string;
  role: string;
  route: Waypoint[];
  wp: number;
  dwell: number;
  loop: boolean;
  /** Recent floor positions for the tracking trail. */
  trail: Vec2[];
  trailAcc: number;
  zone: string | null;
  zoneSince: number;
  restricted: boolean;
  restrictedSince: number;
  flagged: boolean;
  shirt: number;
}

export type VehicleState = "moving" | "docking" | "docked" | "leaving" | "waiting";

export interface VehicleEntity extends EntityBase {
  kind: "montacarga" | "camion";
  pos: Vec2;
  heading: number;
  speed: number;
  targetSpeed: number;
  route: Waypoint[];
  wp: number;
  state: VehicleState;
  trail: Vec2[];
  trailAcc: number;
  dock: number;
  code: string;
  plate: string;
  operator: string;
  dwell: number;
  carrying: boolean;
  wrongWay: boolean;
  inPedestrian: boolean;
  tone: number;
  length: number;
  width: number;
}

export type DefectType =
  | "erosion"
  | "grieta"
  | "delaminacion"
  | "rayo"
  | "pintura";

export type DefectSeverity = "baja" | "media" | "alta";

export interface DefectEntity extends EntityBase {
  kind: "defecto";
  type: DefectType;
  assetId: string;
  blade: "A" | "B" | "C";
  /** Position along the blade 0 (root) .. 1 (tip) and across (-1..1). */
  u: number;
  v: number;
  /** Size along/across blade as fraction of blade length / chord. */
  su: number;
  sv: number;
  severity: DefectSeverity;
  areaPct: number;
  /** Polygon in local unit coordinates (-1..1). */
  poly: Vec2[];
}

export interface FieldEntity extends EntityBase {
  kind: "campo";
  field: string;
  label: string;
  value: string;
  /** Box in document-normalised coordinates (0..1). */
  box: Box;
  group: "cabecera" | "item" | "pie";
  row: number;
}

export type Entity =
  | BoxEntity
  | PalletEntity
  | PersonEntity
  | VehicleEntity
  | DefectEntity
  | FieldEntity;

/** Polygonal zone in scene pixels. */
export interface Zone {
  id: string;
  label: string;
  kind: "restricted" | "area" | "line" | "dock" | "pedestrian" | "lane";
  points: Vec2[];
  /** Floor-space polygon in metres, when the zone lives on the floor plane. */
  floor?: Vec2[];
}

/** What the "camera" can see of an entity; the input to the detector. */
export interface Observable {
  entityId: number;
  trackId: number;
  kind: EntityKind;
  box: Box;
  /** Relative distance to camera 0 (near) .. 1 (far). */
  depth: number;
  /** Fraction of the object hidden by others or by the frame edge. */
  occlusion: number;
  mask?: Vec2[];
  pose?: Vec2[];
  head?: Box;
  torso?: Box;
  trail?: Vec2[];
  attrs: ObservableAttrs;
}

export interface ObservableAttrs {
  sku?: string;
  expected?: boolean;
  damaged?: boolean;
  open?: boolean;
  film?: boolean;
  helmet?: boolean;
  vest?: boolean;
  name?: string;
  role?: string;
  restricted?: boolean;
  zone?: string | null;
  code?: string;
  plate?: string;
  state?: string;
  carrying?: boolean;
  wrongWay?: boolean;
  inPedestrian?: boolean;
  dock?: number;
  defectType?: DefectType;
  severity?: DefectSeverity;
  areaPct?: number;
  assetId?: string;
  field?: string;
  fieldLabel?: string;
  value?: string;
  group?: string;
}

export type DetectionStatus = "ok" | "warn" | "alert";

export interface Detection {
  trackId: number;
  entityId: number;
  cls: string;
  label: string;
  conf: number;
  box: Box;
  mask?: Vec2[];
  pose?: Vec2[];
  trail?: Vec2[];
  status: DetectionStatus;
  /** Secondary text for the label chip, e.g. SKU code or operator name. */
  sub?: string;
  color: string;
}

export interface DetectionFrame {
  tick: number;
  t: number;
  latencyMs: number;
  detections: Detection[];
}

export interface Telemetry {
  latencyMs: number;
  fps: number;
  boxesPerSec: number;
  gpuUtil: number;
  vramGb: number;
  streamFps: number;
  boxes: number;
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  /** Positive = good when up; negative = good when down; 0 = neutral. */
  trend?: number;
  status?: DetectionStatus;
  hint?: string;
}
