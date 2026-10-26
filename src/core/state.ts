import { BUILDING_TYPES } from './constants';
import type { Building, BuildingType, FactoryState } from './types';

export function cloneBuilding(building: Building): Building {
  return {
    ...building,
    buffer: building.buffer.slice(),
    ...(building.output ? { output: building.output.slice() } : {}),
  };
}

export function cloneFactoryState(state: FactoryState): FactoryState {
  return {
    ...state,
    buildings: state.buildings.map(cloneBuilding),
    starterInventory: { ...state.starterInventory },
  };
}

export function findBuilding(
  state: FactoryState,
  id: string,
): Building | undefined {
  return state.buildings.find((building) => building.id === id);
}

export function hasBuildingId(state: FactoryState, id: string): boolean {
  return state.buildings.some((building) => building.id === id);
}

export function countByType(
  state: FactoryState,
  type: BuildingType,
): number {
  return state.buildings.filter((building) => building.type === type).length;
}

export function totalBuildingCount(state: FactoryState): number {
  return state.buildings.length;
}

/**
 * Structural equality used by autosave bookkeeping. Simulation time is included
 * because the saved state must restore progress as well.
 */
export function factoryStatesEqual(a: FactoryState, b: FactoryState): boolean {
  if (a === b) return true;
  if (
    a.factoryId !== b.factoryId ||
    a.cellSizeMeters !== b.cellSizeMeters ||
    a.credits !== b.credits ||
    a.totalPartsSold !== b.totalPartsSold ||
    a.simulationTimeSeconds !== b.simulationTimeSeconds ||
    a.isPaused !== b.isPaused ||
    a.nextBuildingOrdinal !== b.nextBuildingOrdinal ||
    a.buildings.length !== b.buildings.length
  ) {
    return false;
  }
  for (let i = 0; i < BUILDING_TYPES.length; i += 1) {
    const type = BUILDING_TYPES[i];
    if (type === undefined) continue;
    if (a.starterInventory[type] !== b.starterInventory[type]) return false;
  }
  for (let i = 0; i < a.buildings.length; i += 1) {
    const left = a.buildings[i];
    const right = b.buildings[i];
    if (left === undefined || right === undefined) return false;
    if (
      left.id !== right.id ||
      left.type !== right.type ||
      left.x !== right.x ||
      left.z !== right.z ||
      left.rotation !== right.rotation ||
      (left.level ?? 0) !== (right.level ?? 0) ||
      left.resource !== right.resource || left.recipe !== right.recipe ||
      left.liftDirection !== right.liftDirection ||
      JSON.stringify(left.output ?? []) !== JSON.stringify(right.output ?? []) ||
      left.progress !== right.progress ||
      left.purchaseSource !== right.purchaseSource ||
      left.enabled !== right.enabled ||
      left.buffer.length !== right.buffer.length
    ) {
      return false;
    }
    for (let j = 0; j < left.buffer.length; j += 1) {
      if (left.buffer[j] !== right.buffer[j]) return false;
    }
  }
  return true;
}

/** A cheap revision-based change tracker for autosave. */
export class RevisionCounter {
  private revision = 0;

  bump(): void {
    this.revision += 1;
  }

  get value(): number {
    return this.revision;
  }
}
