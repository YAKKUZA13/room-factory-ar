import { cellKey, forwardCell, neighbor, oppositeDirection } from './grid';
import type { Building, Direction } from './types';

export type ConveyorShape = 'straight' | 'from-left' | 'from-right';
export type Occupancy = ReadonlyMap<string, Building>;

function feedsFrom(building: Building, side: Direction, occupancy: Occupancy): boolean {
  const cell = neighbor(building, side);
  const source = occupancy.get(cellKey(cell.x, cell.z, building.level ?? 0));
  if (!source || source.type === 'generator') return false;
  const output = forwardCell(source);
  return output.x === building.x && output.z === building.z;
}

/** Structural connections ignore buffers and power so a junction never flickers during production. */
export function conveyorInputDirection(building: Building, occupancy: Occupancy): Direction {
  const rear = oppositeDirection(building.rotation);
  if (feedsFrom(building, rear, occupancy)) return rear;
  const left = ((building.rotation + 3) % 4) as Direction;
  const right = ((building.rotation + 1) % 4) as Direction;
  const fromLeft = feedsFrom(building, left, occupancy);
  const fromRight = feedsFrom(building, right, occupancy);
  if (fromLeft !== fromRight) return fromLeft ? left : right;
  // Two competing side inputs keep a straight belt; adding a rear input has explicit priority.
  return rear;
}

export function conveyorShape(building: Building, occupancy: Occupancy): ConveyorShape {
  const relative = (conveyorInputDirection(building, occupancy) - building.rotation + 4) % 4;
  return relative === 3 ? 'from-left' : relative === 1 ? 'from-right' : 'straight';
}

export function conveyorAcceptsFrom(source: Building, target: Building, occupancy: Occupancy): boolean {
  if ((source.level ?? 0) !== (target.level ?? 0)) return false;
  const input = neighbor(target, conveyorInputDirection(target, occupancy));
  const output = forwardCell(source);
  return input.x === source.x && input.z === source.z && output.x === target.x && output.z === target.z;
}
