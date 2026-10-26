import { GRID_HEIGHT, GRID_WIDTH, MAX_CELL_SIZE_METERS, MIN_CELL_SIZE_METERS } from './constants';
import type { Building, Direction, FactoryState, GridPoint } from './types';

export const DIRECTION_VECTORS: Readonly<Record<Direction, GridPoint>> = {
  0: { x: 0, z: 1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: -1 },
  3: { x: -1, z: 0 },
};

export function isDirection(value: unknown): value is Direction {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function nextDirection(direction: Direction, clockwise: boolean): Direction {
  return ((direction + (clockwise ? 1 : 3)) % 4) as Direction;
}

export function directionVector(direction: Direction): GridPoint {
  return DIRECTION_VECTORS[direction];
}

export function oppositeDirection(direction: Direction): Direction {
  return ((direction + 2) % 4) as Direction;
}

export function cellKey(x: number, z: number): string {
  return `${x}:${z}`;
}

export function cellIndex(x: number, z: number): number {
  return z * GRID_WIDTH + x;
}

export function isInsideGrid(x: number, z: number): boolean {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && x < GRID_WIDTH && z >= 0 && z < GRID_HEIGHT;
}

export function neighbor(point: GridPoint, direction: Direction): GridPoint {
  const vector = DIRECTION_VECTORS[direction];
  return { x: point.x + vector.x, z: point.z + vector.z };
}

export function buildingAt(
  buildings: readonly Building[],
  x: number,
  z: number,
): Building | undefined {
  return buildings.find((building) => building.x === x && building.z === z);
}

export function buildOccupancy(buildings: readonly Building[]): Map<string, Building> {
  const map = new Map<string, Building>();
  for (const building of buildings) {
    map.set(cellKey(building.x, building.z), building);
  }
  return map;
}

export function forwardCell(building: Building): GridPoint {
  return neighbor(building, building.rotation);
}

export function rearCell(building: Building): GridPoint {
  return neighbor(building, oppositeDirection(building.rotation));
}

/**
 * Factory-local coordinates of a cell centre in cell units (1 unit = one cell).
 * The factory origin is the centre of the platform, not the south-west corner.
 * This convention is documented in README.md and used by the renderer/anchor math.
 */
export function cellCenterLocal(x: number, z: number): { x: number; z: number } {
  return {
    x: x - (GRID_WIDTH - 1) / 2,
    z: z - (GRID_HEIGHT - 1) / 2,
  };
}

/** Physical local position in metres (cell units × cellSizeMeters). */
export function cellCenterMeters(
  x: number,
  z: number,
  cellSizeMeters: number,
): { x: number; z: number } {
  const local = cellCenterLocal(x, z);
  return { x: local.x * cellSizeMeters, z: local.z * cellSizeMeters };
}

export function clampCellSize(value: number): number {
  if (!Number.isFinite(value)) return MAX_CELL_SIZE_METERS;
  return Math.min(MAX_CELL_SIZE_METERS, Math.max(MIN_CELL_SIZE_METERS, value));
}

export function validateCellSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_CELL_SIZE_METERS - 1e-9 &&
    value <= MAX_CELL_SIZE_METERS + 1e-9
  );
}

/** Stable ordering used for deterministic logistics resolution. */
export function compareBuildingIds(a: Building, b: Building): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function sortedBuildings(buildings: readonly Building[]): Building[] {
  return [...buildings].sort(compareBuildingIds);
}

/** Sum of all ore currently stored in buildings (extractor, conveyor, processor). */
export function countItems(state: FactoryState): number {
  return state.buildings.reduce((total, building) => total + building.buffer.length, 0);
}
