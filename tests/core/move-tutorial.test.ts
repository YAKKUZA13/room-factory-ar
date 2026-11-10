import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/commands';
import { firstLineStep } from '../../src/core/tutorial';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { place, must } from '../helpers';

describe('moving a building', () => {
  it('preserves identity, cargo, recipe, progress and economy, including across floors', () => {
    const state = place(createInitialFactoryState(), 'processor', 2, 2, 1);
    const building = state.buildings[0]!;
    building.recipe = 'plate'; building.buffer = ['ore']; building.output = ['plate']; building.progress = 1.3;
    const next = must(applyCommand(state, { type: 'move', id: building.id, x: 3, z: 4, level: 2, rotation: 3 }));
    expect(next.buildings[0]).toEqual({ ...building, x: 3, z: 4, level: 2, rotation: 3 });
    expect(next.credits).toBe(state.credits);
    expect(next.starterInventory).toEqual(state.starterInventory);
    expect(state.buildings[0]).toEqual(building);
    expect(state.buildings[0]!.x).toBe(2);
  });

  it('rejects occupied cells, invalid floors and coordinates without changing the source', () => {
    let state = place(createInitialFactoryState(), 'extractor', 2, 2);
    state = place(state, 'conveyor', 3, 2);
    const before = structuredClone(state);
    for (const target of [{ x: 3, z: 2 }, { x: -1, z: 0 }, { x: 1.2, z: 0 }, { x: 0, z: 0, level: 6 }, { x: 0, z: 0, level: NaN }]) {
      expect(applyCommand(state, { type: 'move', id: 'b1', ...target }).ok).toBe(false);
      expect(state).toEqual(before);
    }
    expect(applyCommand(state, { type: 'move', id: 'missing', x: 0, z: 0 }).ok).toBe(false);
    expect(applyCommand(state, { type: 'move', id: 'b1', x: 0, z: 0, rotation: 7 as never }).ok).toBe(false);
    expect(applyCommand(state, { type: 'move', id: 'b1', x: 2, z: 2 }).ok).toBe(true);
  });
});

describe('first line objectives', () => {
  it('never skips prerequisites when buildings are placed out of order', () => {
    let state = place(createInitialFactoryState(), 'processor', 4, 2);
    state = place(state, 'extractor', 2, 2, 1);
    expect(firstLineStep(state, false)).toBe(0);
    expect(firstLineStep(state, true)).toBe(1);
    state = place(state, 'generator', 0, 0);
    expect(firstLineStep(state, true)).toBe(3);
    state.buildings.find(b => b.type === 'extractor')!.resource = 'copper';
    expect(firstLineStep(state, true)).toBe(2);
  });

  it('requires an actual directed ore line and returns to the connection step after a break', () => {
    let state = place(createInitialFactoryState(), 'generator', 0, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 0);
    state = place(state, 'processor', 4, 2);
    expect(firstLineStep(state, true)).toBe(3);
    state.buildings[2]!.rotation = 1;
    expect(firstLineStep(state, true)).toBe(4);
    state = must(applyCommand(state, { type: 'move', id: 'b3', x: 3, z: 3 }));
    expect(firstLineStep(state, true)).toBe(3);
    state.totalPartsSold = 1;
    expect(firstLineStep(state, true)).toBe(5);
  });
});
