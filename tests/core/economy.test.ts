import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/commands';
import { FIXED_DT, STARTER_KIT } from '../../src/core/constants';
import { getEnergyStats } from '../../src/core/economy';
import { countItems } from '../../src/core/grid';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { countOre } from '../../src/core/logistics';
import { serializeFactory, deserializeFactory } from '../../src/core/serialization';
import { FactoryEngine, FixedStepClock } from '../../src/core/simulation';
import { buildWorkingChain, frozenSnapshot, must, place } from '../helpers';

describe('placement and starter kit', () => {
  it('places a starter building once without touching credits', () => {
    const initial = createInitialFactoryState({ factoryId: 'test' });
    const next = place(initial, 'generator', 0, 0, 0);
    expect(next.buildings).toHaveLength(1);
    expect(next.credits).toBe(initial.credits);
    expect(next.starterInventory.generator).toBe(0);
    expect(next.buildings[0]?.purchaseSource).toBe('starter');
    expect(next.buildings[0]?.id).toBe('b1');
    expect(next.nextBuildingOrdinal).toBe(2);
  });

  it('charges credits only after the starter slot is exhausted', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'generator', 0, 0);
    expect(state.credits).toBe(120);
    state = place(state, 'generator', 1, 0);
    expect(state.credits).toBe(60);
    expect(state.buildings[1]?.purchaseSource).toBe('credits');
  });

  it('rejects a second building on an occupied cell without mutating state', () => {
    const state = place(createInitialFactoryState({ factoryId: 'test' }), 'generator', 3, 3);
    const before = frozenSnapshot(state);
    const result = applyCommand(state, {
      type: 'place',
      buildingType: 'conveyor',
      x: 3,
      z: 3,
      rotation: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('occupied');
    expect(frozenSnapshot(state)).toBe(before);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [10, 0],
    [0, 10],
    [1.5, 2],
    [2, 3.2],
  ])('rejects invalid coordinates (%s, %s)', (x, z) => {
    const state = createInitialFactoryState({ factoryId: 'test' });
    const result = applyCommand(state, {
      type: 'place',
      buildingType: 'conveyor',
      x,
      z,
      rotation: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('out-of-bounds');
    expect(state.buildings).toHaveLength(0);
  });

  it('rejects an invalid rotation', () => {
    const state = createInitialFactoryState({ factoryId: 'test' });
    const result = applyCommand(state, {
      type: 'place',
      buildingType: 'conveyor',
      x: 0,
      z: 0,
      rotation: 7 as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-rotation');
  });

  it('does not create a building when credits are insufficient', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'processor', 0, 0);
    state = place(state, 'processor', 1, 0);
    expect(state.credits).toBe(40);
    const before = frozenSnapshot(state);
    const result = applyCommand(state, {
      type: 'place',
      buildingType: 'processor',
      x: 2,
      z: 0,
      rotation: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('insufficient-credits');
    expect(frozenSnapshot(state)).toBe(before);
  });
});

describe('removal refunds', () => {
  it('returns a starter slot, not credits, when a starter building is removed', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'generator', 0, 0);
    const id = state.buildings[0]?.id;
    expect(id).toBeDefined();
    state = must(applyCommand(state, { type: 'remove', id: id as string }));
    expect(state.buildings).toHaveLength(0);
    expect(state.credits).toBe(120);
    expect(state.starterInventory.generator).toBe(STARTER_KIT.generator);
  });

  it('refunds 50% of the purchase price for a paid building', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'generator', 0, 0);
    state = place(state, 'generator', 1, 0);
    expect(state.credits).toBe(60);
    const id = state.buildings[1]?.id as string;
    state = must(applyCommand(state, { type: 'remove', id }));
    expect(state.credits).toBe(90);
    expect(state.starterInventory.generator).toBe(0);
  });

  it('does not refund credits for a starter building with ore in its buffer', () => {
    let engine = new FactoryEngine(buildWorkingChain());
    const conveyor = engine.state.buildings.find((b) => b.type === 'conveyor');
    // Block the conveyor so the extractor cannot hand off its first ore.
    engine.dispatch({ type: 'rotate', id: conveyor?.id as string, clockwise: true });
    for (let i = 0; i < 30; i += 1) engine.step(FIXED_DT);
    const extractor = engine.state.buildings.find((b) => b.type === 'extractor');
    expect(extractor?.buffer).toHaveLength(1);
    const result = engine.dispatch({ type: 'remove', id: extractor?.id as string });
    expect(result.ok).toBe(true);
    expect(engine.state.credits).toBe(120);
    expect(engine.state.starterInventory.extractor).toBe(1);
  });
});

describe('rotation', () => {
  it('cycles +Z -> +X -> -Z -> -X -> +Z', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'conveyor', 0, 0, 0);
    const id = state.buildings[0]?.id as string;
    const rotations: number[] = [state.buildings[0]?.rotation as number];
    for (let i = 0; i < 4; i += 1) {
      state = must(applyCommand(state, { type: 'rotate', id, clockwise: true }));
      rotations.push(state.buildings[0]?.rotation as number);
    }
    expect(rotations).toEqual([0, 1, 2, 3, 0]);
  });

  it('counter-clockwise reverses the cycle', () => {
    let state = place(createInitialFactoryState({ factoryId: 'test' }), 'conveyor', 0, 0, 0);
    const id = state.buildings[0]?.id as string;
    state = must(applyCommand(state, { type: 'rotate', id, clockwise: false }));
    expect(state.buildings[0]?.rotation).toBe(3);
  });
});

describe('energy grid', () => {
  it('10 supply vs 9 demand has no brownout', () => {
    const state = buildWorkingChain();
    const energy = getEnergyStats(state);
    expect(energy.supply).toBe(10);
    expect(energy.demand).toBe(9);
    expect(energy.brownout).toBe(false);
  });

  it('brownout blocks production until another generator is added', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 1);
    state = place(state, 'processor', 4, 2, 0);
    let engine = new FactoryEngine(state);
    for (let i = 0; i < 100; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(120);
    expect(countOre(engine.state)).toBe(0);
    expect(getEnergyStats(engine.state).brownout).toBe(true);

    const result = engine.dispatch({
      type: 'place',
      buildingType: 'generator',
      x: 1,
      z: 1,
      rotation: 0,
    });
    expect(result.ok).toBe(true);
    for (let i = 0; i < 60; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(132);
    expect(engine.state.totalPartsSold).toBe(1);
  });

  it('preserves production progress through a brownout', () => {
    let engine = new FactoryEngine(buildWorkingChain());
    for (let i = 0; i < 10; i += 1) engine.step(FIXED_DT);
    const extractor = engine.state.buildings.find((b) => b.type === 'extractor');
    const before = extractor?.progress ?? 0;
    const generator = engine.state.buildings.find((b) => b.type === 'generator');
    engine.dispatch({ type: 'toggle', id: generator?.id as string, enabled: false });
    for (let i = 0; i < 20; i += 1) engine.step(FIXED_DT);
    const during = engine.state.buildings.find((b) => b.type === 'extractor')?.progress ?? 0;
    expect(during).toBeCloseTo(before, 9);
    engine.dispatch({ type: 'toggle', id: generator?.id as string, enabled: true });
    for (let i = 0; i < 20; i += 1) engine.step(FIXED_DT);
    expect(countOre(engine.state)).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 50; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(132);
  });
});

describe('production chain', () => {
  it('extractor -> conveyor -> processor sells the first part on tick 58', () => {
    const engine = new FactoryEngine(buildWorkingChain());
    let saleTick = -1;
    for (let tick = 1; tick <= 70; tick += 1) {
      engine.step(FIXED_DT);
      if (engine.state.totalPartsSold === 1) {
        saleTick = tick;
        break;
      }
    }
    expect(saleTick).toBe(58);
    expect(engine.state.credits).toBe(132);
  });

  it('produces a part every 25 ticks once the pipeline is full', () => {
    const engine = new FactoryEngine(buildWorkingChain());
    for (let i = 0; i < 200; i += 1) engine.step(FIXED_DT);
    // 200 ticks / 25 tick cycle ≈ 8 parts; the first starts at tick 58.
    expect(engine.state.totalPartsSold).toBe(6);
    expect(engine.state.credits).toBe(120 + 6 * 12);
  });

  it('a conveyor pointing the wrong way stops ore', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'generator', 1, 1, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 0); // points +Z, not toward processor
    state = place(state, 'processor', 4, 2, 0);
    const engine = new FactoryEngine(state);
    for (let i = 0; i < 200; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(120);
    expect(engine.state.totalPartsSold).toBe(0);
    expect(countOre(engine.state)).toBeGreaterThan(0);
  });

  it('fixing the conveyor orientation resumes production', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'generator', 1, 1, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 0);
    state = place(state, 'processor', 4, 2, 0);
    let engine = new FactoryEngine(state);
    for (let i = 0; i < 60; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(120);
    const conveyor = engine.state.buildings.find((b) => b.type === 'conveyor');
    engine.dispatch({ type: 'rotate', id: conveyor?.id as string, clockwise: true });
    for (let i = 0; i < 120; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBeGreaterThan(120);
  });

  it('direct extractor -> processor transfer works', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'generator', 1, 1, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'processor', 3, 2, 0);
    const engine = new FactoryEngine(state);
    for (let i = 0; i < 80; i += 1) engine.step(FIXED_DT);
    expect(engine.state.totalPartsSold).toBeGreaterThan(0);
  });

  it('keeps buffers within capacity and never duplicates ore', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'generator', 1, 1, 0);
    state = place(state, 'extractor', 2, 2, 1);
    state = place(state, 'conveyor', 3, 2, 1);
    state = place(state, 'processor', 4, 2, 0);
    const engine = new FactoryEngine(state);
    let produced = 0;
    let sold = 0;
    for (let i = 0; i < 500; i += 1) {
      engine.step(FIXED_DT);
      for (const event of engine.consumeEvents()) {
        if (event.type === 'ore-produced') produced += 1;
        if (event.type === 'part-sold') sold += 1;
      }
      for (const building of engine.state.buildings) {
        expect(building.buffer.length).toBeLessThanOrEqual(1);
        expect(building.progress).toBeGreaterThanOrEqual(0);
      }
    }
    expect(produced).toBe(sold + countItems(engine.state));
    expect(sold).toBeGreaterThan(0);
  });

  it('resolves multiple extractors into one processor deterministically without duplication', () => {
    let state = createInitialFactoryState({ factoryId: 'test' });
    state = place(state, 'generator', 1, 1, 0);
    state = place(state, 'generator', 1, 2, 0); // paid 60
    state = place(state, 'extractor', 4, 5, 1); // starter
    state = place(state, 'processor', 5, 5, 0); // starter
    state = place(state, 'extractor', 6, 5, 3); // paid 50
    expect(state.credits).toBe(10);
    const engine = new FactoryEngine(state);
    let produced = 0;
    let sold = 0;
    for (let i = 0; i < 1000; i += 1) {
      engine.step(FIXED_DT);
      for (const event of engine.consumeEvents()) {
        if (event.type === 'ore-produced') produced += 1;
        if (event.type === 'part-sold') sold += 1;
      }
    }
    expect(produced).toBe(sold + countOre(engine.state));
    expect(sold).toBeGreaterThan(30);
    expect(countOre(engine.state)).toBeLessThanOrEqual(3);
  });
});

describe('pause and determinism', () => {
  it('pause stops all production and preserves state', () => {
    const engine = new FactoryEngine(buildWorkingChain());
    for (let i = 0; i < 60; i += 1) engine.step(FIXED_DT);
    const credits = engine.state.credits;
    const time = engine.state.simulationTimeSeconds;
    engine.dispatch({ type: 'pause', paused: true });
    const frozen = frozenSnapshot(engine.state);
    for (let i = 0; i < 100; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBe(credits);
    expect(engine.state.simulationTimeSeconds).toBe(time);
    expect(frozenSnapshot(engine.state)).toBe(frozen);
    engine.dispatch({ type: 'pause', paused: false });
    for (let i = 0; i < 100; i += 1) engine.step(FIXED_DT);
    expect(engine.state.credits).toBeGreaterThan(credits);
  });

  it('30 fps and 60 fps frame drivers produce identical state', () => {
    const engine30 = new FactoryEngine(buildWorkingChain());
    const engine60 = new FactoryEngine(buildWorkingChain());
    const clock30 = new FixedStepClock();
    const clock60 = new FixedStepClock();
    for (let i = 0; i < 30 * 20; i += 1) clock30.update(1 / 30, (dt) => engine30.step(dt));
    for (let i = 0; i < 60 * 20; i += 1) clock60.update(1 / 60, (dt) => engine60.step(dt));
    expect(engine30.state.totalPartsSold).toBe(engine60.state.totalPartsSold);
    expect(engine30.state.credits).toBe(engine60.state.credits);
    expect(engine30.state.simulationTimeSeconds).toBeCloseTo(
      engine60.state.simulationTimeSeconds,
      6,
    );
    for (const building of engine30.state.buildings) {
      const other = engine60.state.buildings.find((b) => b.id === building.id);
      expect(other?.progress).toBeCloseTo(building.progress, 6);
      expect(other?.buffer).toEqual(building.buffer);
    }
  });
});

describe('save roundtrip', () => {
  it('restores buffers, progress, starter stock and credits', () => {
    const engine = new FactoryEngine(buildWorkingChain());
    for (let i = 0; i < 70; i += 1) engine.step(FIXED_DT);
    const saved = serializeFactory(engine.state);
    const restored = must(deserializeFactory(saved));
    const engine2 = new FactoryEngine(restored);
    for (let i = 0; i < 30; i += 1) {
      engine.step(FIXED_DT);
      engine2.step(FIXED_DT);
    }
    expect(engine2.state.credits).toBe(engine.state.credits);
    expect(engine2.state.totalPartsSold).toBe(engine.state.totalPartsSold);
    expect(engine2.state.starterInventory).toEqual(engine.state.starterInventory);
    expect(engine2.state.buildings.map((b) => b.id)).toEqual(
      engine.state.buildings.map((b) => b.id),
    );
    for (const building of engine.state.buildings) {
      const other = engine2.state.buildings.find((b) => b.id === building.id);
      expect(other?.progress).toBeCloseTo(building.progress, 6);
      expect(other?.buffer).toEqual(building.buffer);
    }
  });

  it('reset creates a fresh factory with the starter kit and keeps cell size', () => {
    let state = buildWorkingChain();
    state = { ...state, cellSizeMeters: 0.075 };
    const engine = new FactoryEngine(state);
    engine.dispatch({ type: 'reset-factory' });
    expect(engine.state.buildings).toHaveLength(0);
    expect(engine.state.credits).toBe(120);
    expect(engine.state.starterInventory).toEqual(STARTER_KIT);
    expect(engine.state.cellSizeMeters).toBe(0.075);
    expect(engine.state.totalPartsSold).toBe(0);
  });
});
