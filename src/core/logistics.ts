import { CONVEYOR_MOVE_SECONDS } from './constants';
import { buildOccupancy, cellKey, forwardCell, rearCell, sortedBuildings } from './grid';
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

function targetAccepts(source: Building, target: Building): boolean {
  if (!target.enabled) return false;
  if (target.buffer.length >= capacityOf(target)) return false;
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

function capacityOf(building: Building): number {
  switch (building.type) {
    case 'extractor':
    case 'conveyor':
    case 'processor':
      return 1;
    case 'generator':
      return 0;
  }
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
    if (!source.enabled || source.buffer.length === 0) continue;

    if (source.type === 'extractor') {
      // ready immediately when it holds ore
    } else if (source.type === 'conveyor') {
      if (source.progress + EPSILON < CONVEYOR_MOVE_SECONDS) continue;
    } else {
      continue;
    }

    const targetCell = forwardCell(source);
    const target = occupancy.get(cellKey(targetCell.x, targetCell.z));
    if (!target) continue;
    if (!targetAccepts(source, target)) continue;

    intents.push({
      sourceId: source.id,
      targetId: target.id,
      item: 'ore',
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
    const item = source.buffer.shift();
    if (!item) continue;
    target.buffer.push(item);
    if (source.type === 'conveyor') source.progress = 0;
    if (target.type === 'conveyor') target.progress = 0;
    if (target.type === 'processor') target.progress = 0;
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
  return state.buildings.reduce((sum, building) => sum + building.buffer.length, 0);
}
