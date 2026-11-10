import { describe, expect, it } from 'vitest';
import { conveyorAcceptsFrom, conveyorInputDirection, conveyorShape } from '../../src/core/conveyor-topology';
import { buildOccupancy, directionVector, oppositeDirection } from '../../src/core/grid';
import { planTransfers, commitTransfers, countOre } from '../../src/core/logistics';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { simulateStep } from '../../src/core/simulation';
import { firstLineStep } from '../../src/core/tutorial';
import { applyCommand } from '../../src/core/commands';
import type { Building, Direction } from '../../src/core/types';
import { must, place } from '../helpers';

const belt = (id: string, x: number, z: number, rotation: Direction, level = 0): Building => ({
  id, type: 'conveyor', x, z, rotation, level, enabled: true, buffer: [], progress: 0, purchaseSource: 'starter',
});

describe('conveyor connections', () => {
  for (const output of [0, 1, 2, 3] as Direction[]) {
    for (const turn of [-1, 1]) {
      it(`curves from side ${turn} into output ${output} and transfers exactly one resource`, () => {
        const target = belt('b2', 4, 4, output);
        const side = ((output + turn + 4) % 4) as Direction;
        const vector = directionVector(side);
        const source = belt('b1', 4 + vector.x, 4 + vector.z, oppositeDirection(side));
        source.buffer = ['copper']; source.progress = 0.75;
        const state = createInitialFactoryState(); state.buildings = [source, target];
        const occupancy = buildOccupancy(state.buildings);
        expect(conveyorInputDirection(target, occupancy)).toBe(side);
        expect(conveyorShape(target, occupancy)).toBe(turn < 0 ? 'from-left' : 'from-right');
        expect(conveyorAcceptsFrom(source, target, occupancy)).toBe(true);
        commitTransfers(state, planTransfers(state, false));
        expect(target.buffer).toEqual(['copper']);
        expect(source.buffer).toEqual([]);
        expect(countOre(state)).toBe(1);
      });
    }
  }

  it('keeps rear priority at a T junction and does not accept a second competing input', () => {
    const target = belt('b3', 4, 4, 0);
    const rear = belt('b1', 4, 3, 0);
    const side = belt('b2', 3, 4, 1);
    rear.buffer = ['ore']; rear.progress = 0.75;
    side.buffer = ['copper']; side.progress = 0.75;
    const state = createInitialFactoryState(); state.buildings = [rear, side, target];
    expect(conveyorShape(target, buildOccupancy(state.buildings))).toBe('straight');
    commitTransfers(state, planTransfers(state, false));
    expect(target.buffer).toEqual(['ore']); expect(side.buffer).toEqual(['copper']);
    expect(countOre(state)).toBe(2);
  });

  it('ignores other floors, head-on outputs and neighbours that point away', () => {
    const target = belt('b2', 4, 4, 0);
    for (const source of [belt('b1', 3, 4, 1, 1), belt('b1', 4, 5, 2), belt('b1', 3, 4, 3)]) {
      const occupancy = buildOccupancy([source, target]);
      expect(conveyorShape(target, occupancy)).toBe('straight');
      expect(conveyorAcceptsFrom(source, target, occupancy)).toBe(false);
    }
  });

  it('does not change shape with power or cargo; ambiguous side inputs stay straight', () => {
    const target = belt('b3', 4, 4, 0), left = belt('b1', 3, 4, 1), right = belt('b2', 5, 4, 3);
    left.enabled = false;
    expect(conveyorShape(target, buildOccupancy([left, target]))).toBe('from-left');
    expect(conveyorShape(target, buildOccupancy([left, right, target]))).toBe('straight');
  });

  it('produces through two opposite bends and updates the tutorial and shape after moving/removing an input', () => {
    let state = createInitialFactoryState();
    state = place(state, 'generator', 0, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 1);
    state = place(state, 'conveyor', 4, 2, 0);
    state = place(state, 'conveyor', 4, 3, 1);
    state = place(state, 'processor', 5, 3);
    expect(conveyorShape(state.buildings[3]!, buildOccupancy(state.buildings))).toBe('from-left');
    expect(conveyorShape(state.buildings[4]!, buildOccupancy(state.buildings))).toBe('from-right');
    expect(firstLineStep(state, true)).toBe(4);
    for (let i = 0; i < 100; i++) state = simulateStep(state, 0.1).state;
    expect(state.totalPartsSold).toBeGreaterThan(0);
    state = must(applyCommand(state, { type: 'move', id: 'b3', x: 2, z: 5 }));
    expect(conveyorShape(state.buildings[3]!, buildOccupancy(state.buildings))).toBe('straight');
    state = must(applyCommand(state, { type: 'remove', id: 'b4' }));
    expect(conveyorShape(state.buildings.find(b => b.id === 'b5')!, buildOccupancy(state.buildings))).toBe('straight');
  });
});
