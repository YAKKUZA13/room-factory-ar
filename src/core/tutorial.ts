import { buildOccupancy, cellKey, forwardCell } from './grid';
import { conveyorAcceptsFrom } from './conveyor-topology';
import type { FactoryState } from './types';

/** Current first-line objective, derived from the factory rather than placement order. */
export function firstLineStep(state: Readonly<FactoryState>, placed: boolean): number {
  if (state.totalPartsSold > 0) return 5;
  if (!placed) return 0;
  if (!state.buildings.some(b => b.type === 'generator' && b.enabled)) return 1;
  const sources = state.buildings.filter(b => b.type === 'extractor' && b.enabled && (b.resource ?? 'ore') === 'ore');
  if (!sources.length) return 2;
  const occupancy = buildOccupancy(state.buildings);
  const connected = sources.some(source => {
    let current = source;
    const visited = new Set<string>([source.id]);
    let belts = 0;
    while (true) {
      const point = forwardCell(current);
      const next = occupancy.get(cellKey(point.x, point.z, current.level ?? 0));
      if (!next?.enabled || visited.has(next.id)) return false;
      if (next.type === 'processor') return belts > 0 && (next.recipe ?? 'parts') === 'parts';
      if (next.type !== 'conveyor') return false;
      if (!conveyorAcceptsFrom(current, next, occupancy)) return false;
      visited.add(next.id);
      belts += 1;
      current = next;
    }
  });
  return connected ? 4 : 3;
}
