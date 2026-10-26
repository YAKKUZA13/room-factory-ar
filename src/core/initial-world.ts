import {
  DEFAULT_CELL_SIZE_METERS,
  GRID_HEIGHT,
  GRID_WIDTH,
  INITIAL_CREDITS,
  SAVE_SCHEMA_VERSION,
  STARTER_KIT,
} from './constants';
import { clampCellSize } from './grid';
import type { BuildingType, FactoryState } from './types';

export interface InitialFactoryOptions {
  factoryId?: string;
  cellSizeMeters?: number;
  credits?: number;
}

export function createFactoryId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `factory-${globalThis.crypto.randomUUID()}`;
  }
  return `factory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStarterInventory(): Record<BuildingType, number> {
  return { ...STARTER_KIT };
}

export function createInitialFactoryState(options: InitialFactoryOptions = {}): FactoryState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    factoryId: options.factoryId ?? createFactoryId(),
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    cellSizeMeters: clampCellSize(options.cellSizeMeters ?? DEFAULT_CELL_SIZE_METERS),
    credits: options.credits ?? INITIAL_CREDITS,
    totalPartsSold: 0,
    buildings: [],
    starterInventory: createStarterInventory(),
    simulationTimeSeconds: 0,
    isPaused: false,
    nextBuildingOrdinal: 1,
  };
}
