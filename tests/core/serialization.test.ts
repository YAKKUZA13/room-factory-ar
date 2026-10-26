import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/constants';
import { createInitialFactoryState } from '../../src/core/initial-world';
import {
  deserializeFactory,
  validateFactoryState,
} from '../../src/core/serialization';
import { FactoryEngine } from '../../src/core/simulation';
import { buildWorkingChain, place } from '../helpers';

function base(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createInitialFactoryState({ factoryId: 'test' }))) as Record<
    string,
    unknown
  >;
}

describe('factory state validation', () => {
  it('accepts a fresh factory', () => {
    expect(validateFactoryState(base()).ok).toBe(true);
  });

  it('rejects unknown schema versions', () => {
    const input = base();
    input.schemaVersion = 2;
    const result = validateFactoryState(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported-save-version');
  });

  it('rejects NaN credits', () => {
    const input = base();
    input.credits = Number.NaN;
    expect(validateFactoryState(input).ok).toBe(false);
  });

  it('rejects a wrong grid size', () => {
    const input = base();
    input.width = 9;
    expect(validateFactoryState(input).ok).toBe(false);
  });

  it('rejects a cell size outside 0.05..0.10', () => {
    const input = base();
    input.cellSizeMeters = 0.2;
    expect(validateFactoryState(input).ok).toBe(false);
  });

  it('rejects duplicate ids and overlapping buildings', () => {
    let state = buildWorkingChain();
    state = place(state, 'conveyor', 0, 0, 0);
    const parsed = JSON.parse(JSON.stringify(state)) as {
      buildings: Array<Record<string, unknown>>;
    };
    const duplicate = JSON.parse(JSON.stringify(parsed)) as typeof parsed;
    duplicate.buildings[1]!.id = duplicate.buildings[0]!.id;
    expect(validateFactoryState(duplicate).ok).toBe(false);

    const overlap = JSON.parse(JSON.stringify(parsed)) as typeof parsed;
    overlap.buildings[1]!.x = overlap.buildings[0]!.x;
    overlap.buildings[1]!.z = overlap.buildings[0]!.z;
    expect(validateFactoryState(overlap).ok).toBe(false);
  });

  it('rejects an over-capacity buffer and unknown items', () => {
    const input = base();
    input.buildings = [
      {
        id: 'b1',
        type: 'conveyor',
        x: 0,
        z: 0,
        rotation: 0,
        progress: 0,
        buffer: ['ore', 'ore'],
        purchaseSource: 'starter',
        enabled: true,
      },
    ];
    expect(validateFactoryState(input).ok).toBe(false);

    (input.buildings as Array<Record<string, unknown>>)[0]!.buffer = ['gold'];
    expect(validateFactoryState(input).ok).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    const input = base();
    input.buildings = [
      {
        id: 'b1',
        type: 'conveyor',
        x: 1.5,
        z: 0,
        rotation: 0,
        progress: 0,
        buffer: [],
        purchaseSource: 'starter',
        enabled: true,
      },
    ];
    expect(validateFactoryState(input).ok).toBe(false);
  });

  it('rejects corrupted JSON without throwing', () => {
    const result = deserializeFactory('{nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('corrupt-save');
  });

  it('normalizes a valid save produced mid-production', () => {
    const engine = new FactoryEngine(buildWorkingChain());
    for (let i = 0; i < 40; i += 1) engine.step(FIXED_DT);
    const raw = JSON.parse(JSON.stringify(engine.state));
    const result = validateFactoryState(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.buildings).toHaveLength(4);
      expect(result.value.simulationTimeSeconds).toBeGreaterThan(0);
    }
  });
});
