import { applyCommand } from '../src/core/commands';
import { createInitialFactoryState } from '../src/core/initial-world';
import type {
  BuildingType,
  Direction,
  FactoryState,
  Result,
} from '../src/core/types';

export function must<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

export function place(
  state: FactoryState,
  type: BuildingType,
  x: number,
  z: number,
  rotation: Direction = 0,
): FactoryState {
  return must(applyCommand(state, { type: 'place', buildingType: type, x, z, rotation }));
}

export function buildWorkingChain(): FactoryState {
  let state = createInitialFactoryState({ factoryId: 'test-factory' });
  state = place(state, 'generator', 1, 1, 0);
  state = place(state, 'extractor', 2, 2, 1);
  state = place(state, 'conveyor', 3, 2, 1);
  state = place(state, 'processor', 4, 2, 0);
  return state;
}

export function frozenSnapshot(state: FactoryState): string {
  return JSON.stringify(state);
}
