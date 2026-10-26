import { CONVEYOR_MOVE_SECONDS } from './constants';
import { buildOccupancy, cellKey, forwardCell, rearCell, sortedBuildings } from './grid';
import { acceptsItem } from './recipes';
import type {
  Building,
  FactoryState,
  ItemType,
  SimulationEvent,
} from './types';

const EPSILON = 1e-9;

export interface TransferIntent {
  sourceId: string;
  targetId: string;
  item: ItemType;
  sourceX: number;
  sourceZ: number;
  targetX: number;
  targetZ: number;
}

function targetAccepts(source: Building, target: Building, item: ItemType): boolean {
  if (!target.enabled) return false;
  if (!acceptsItem(target, item)) return false;
  if (target.type === 'lift') return true;
  if (target.type === 'processor') {
    // Processors accept from any orthogonal side; source is guaranteed adjacent.
    return true;
  }
  if (target.type === 'conveyor') {
    // Conveyors accept only from behind.
    const rear = rearCell(target);
    return rear.x === source.x && rear.z === source.z;
  }
  return false;
}

/**
 * Two-phase logistics: read the current state, produce intents, resolve conflicts
 * deterministically by source ID, then commit. No item moves more than one edge
 * per fixed step. See SPEC.md §6.3.
 */
export function planTransfers(
  state: FactoryState,
  brownout: boolean,
): TransferIntent[] {
  if (brownout) return [];
  const occupancy = buildOccupancy(state.buildings);
  const intents: TransferIntent[] = [];

  for (const source of sortedBuildings(state.buildings)) {
    const item = (source.type === 'processor' ? source.output : source.buffer)?.[0];
    if (!source.enabled || !item) continue;

    if (source.type === 'extractor') {
      // ready immediately when it holds ore
    } else if (source.type === 'conveyor' || source.type === 'lift') {
      if (source.progress + EPSILON < CONVEYOR_MOVE_SECONDS) continue;
    } else if (source.type !== 'processor') {
      continue;
    }

    const targetCell = forwardCell(source);
    const level = source.level ?? 0;
    let target = occupancy.get(cellKey(targetCell.x, targetCell.z, level));
    if (!target || !targetAccepts(source, target, item)) {
      if (source.type !== 'lift') continue;
      const otherLevel = level + (source.liftDirection === 'down' ? -1 : 1);
      target = occupancy.get(cellKey(source.x, source.z, otherLevel));
      if (!target || target.type !== 'lift' || !targetAccepts(source, target, item)) continue;
    }

    intents.push({
      sourceId: source.id,
      targetId: target.id,
      item,
      sourceX: source.x,
      sourceZ: source.z,
      targetX: target.x,
      targetZ: target.z,
    });
  }

  // Sorted by source ID already; keep a second explicit sort for clarity/stability.
  intents.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));

  const claimedTargets = new Set<string>();
  const accepted: TransferIntent[] = [];
  for (const intent of intents) {
    if (claimedTargets.has(intent.targetId)) continue;
    claimedTargets.add(intent.targetId);
    accepted.push(intent);
  }
  return accepted;
}

/**
 * Commits previously accepted intents into `state` (which must be a draft copy).
 * Returns diagnostic events for UI effects.
 */
export function commitTransfers(
  state: FactoryState,
  intents: readonly TransferIntent[],
): SimulationEvent[] {
  if (intents.length === 0) return [];
  const byId = new Map(state.buildings.map((building) => [building.id, building]));
  const events: SimulationEvent[] = [];

  for (const intent of intents) {
    const source = byId.get(intent.sourceId);
    const target = byId.get(intent.targetId);
    if (!source || !target) continue;
    const item = (source.type === 'processor' ? source.output : source.buffer)?.shift();
    if (!item) continue;
    target.buffer.push(item);
    if (source.type === 'conveyor' || source.type === 'lift') source.progress = 0;
    if (target.type === 'conveyor' || target.type === 'lift') target.progress = 0;
    events.push({
      type: 'transfer',
      fromId: source.id,
      toId: target.id,
      item,
    });
  }
  return events;
}

/** Verifies the item-conservation invariant used by unit tests and diagnostics. */
export function countOre(state: FactoryState): number {
  return state.buildings.reduce((sum, building) => sum + building.buffer.length + (building.output?.length ?? 0), 0);
}
