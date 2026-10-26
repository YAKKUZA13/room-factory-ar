/**
 * Core domain types. This module must stay free of Three.js / DOM / XR imports.
 * See SPEC.md §5.1 and §5.2.
 */

export type BuildingType = 'generator' | 'extractor' | 'conveyor' | 'processor' | 'lift';

/** 0 = +Z, 1 = +X, 2 = -Z, 3 = -X. */
export type Direction = 0 | 1 | 2 | 3;

export type ItemType = 'ore' | 'copper' | 'plate' | 'wire' | 'alloy' | 'module';
export type RawResource = 'ore' | 'copper';
export type RecipeId = 'parts' | 'plate' | 'wire' | 'alloy' | 'module' | 'export';

export type BuildingId = string;

export interface GridPoint {
  x: number;
  z: number;
}

export interface Building {
  id: BuildingId;
  type: BuildingType;
  /** Integer grid coordinate, 0..9. */
  x: number;
  /** Integer grid coordinate, 0..9. */
  z: number;
  rotation: Direction;
  /** Absent in older saves; the ground floor is level 0. */
  level?: number;
  resource?: RawResource;
  recipe?: RecipeId;
  output?: ItemType[];
  liftDirection?: 'up' | 'down';
  /** Seconds accumulated in the current production operation. */
  progress: number;
  /** Capacity is enforced per building type. Only `ore` exists in the MVP. */
  buffer: ItemType[];
  purchaseSource: 'starter' | 'credits';
  enabled: boolean;
}

export interface FactoryState {
  schemaVersion: 1;
  factoryId: string;
  width: 10;
  height: 10;
  /** Physical size of one grid cell in metres. 0.05..0.10 (UI scale 0.5..1.0). */
  cellSizeMeters: number;
  credits: number;
  totalPartsSold: number;
  buildings: Building[];
  starterInventory: Record<BuildingType, number>;
  simulationTimeSeconds: number;
  isPaused: boolean;
  nextBuildingOrdinal: number;
}

export type DomainErrorCode =
  | 'invalid-command'
  | 'invalid-building-type'
  | 'invalid-coordinate'
  | 'invalid-rotation'
  | 'out-of-bounds'
  | 'occupied'
  | 'insufficient-credits'
  | 'building-not-found'
  | 'size-limit'
  | 'invalid-state'
  | 'corrupt-save'
  | 'unsupported-save-version'
  | 'storage-unavailable'
  | 'invalid-import'
  | 'slam-not-tracking'
  | 'marker-mismatch'
  | 'marker-not-stable'
  | 'no-factory-pose'
  | 'internal-error';

export interface DomainError {
  code: DomainErrorCode;
  /** Human readable Russian fallback. UI should prefer `ui/strings.ts` by code. */
  message: string;
  details?: Record<string, unknown>;
}

export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<T = never>(error: DomainError): Result<T, DomainError> {
  return { ok: false, error };
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
): DomainError {
  return details === undefined ? { code, message } : { code, message, details };
}

export interface PlaceCommand {
  type: 'place';
  buildingType: BuildingType;
  x: number;
  z: number;
  rotation: Direction;
  level?: number;
  resource?: RawResource;
  recipe?: RecipeId;
  liftDirection?: 'up' | 'down';
}

export type FactoryCommand =
  | PlaceCommand
  | { type: 'rotate'; id: BuildingId; clockwise: boolean }
  | { type: 'remove'; id: BuildingId }
  | { type: 'toggle'; id: BuildingId; enabled: boolean }
  | { type: 'configure'; id: BuildingId; resource?: RawResource; recipe?: RecipeId; liftDirection?: 'up' | 'down' }
  | { type: 'pause'; paused: boolean }
  | { type: 'reset-factory' };

export type Unsubscribe = () => void;

export interface FactoryEngine {
  readonly state: Readonly<FactoryState>;
  dispatch(command: FactoryCommand): Result<void, DomainError>;
  step(dtSeconds: number): void;
  subscribe(listener: (state: Readonly<FactoryState>) => void): Unsubscribe;
}

export type SimulationEvent =
  | { type: 'ore-produced'; buildingId: BuildingId; at: number }
  | {
      type: 'part-sold';
      buildingId: BuildingId;
      credits: number;
      totalPartsSold: number;
      at: number;
    }
  | { type: 'transfer'; fromId: BuildingId; toId: BuildingId; item: ItemType };

export interface EnergyStats {
  supply: number;
  demand: number;
  brownout: boolean;
  generators: number;
  activeExtractors: number;
  activeProcessors: number;
}
