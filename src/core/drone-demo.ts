import { applyCommand } from './commands';
import { BUILDING_SPECS, GRID_HEIGHT, INITIAL_CREDITS } from './constants';
import { getEnergyStats } from './economy';
import { createInitialFactoryState } from './initial-world';
import type { Direction, FactoryState, PlaceCommand, RawResource, RecipeId } from './types';

const south = 0;
const east = 1;
const north = 2;
const west = 3;

export function createDroneDemo(cellSizeMeters = 0.1): FactoryState {
  let state = createInitialFactoryState({ factoryId: 'drone-factory-demo', credits: 10000, cellSizeMeters });
  let level = 0;
  const place = (options: Omit<PlaceCommand, 'type' | 'level'>) => {
    const result = applyCommand(state, { type: 'place', level, ...options });
    if (!result.ok) throw new Error(`Этаж ${level + 1}, клетка ${options.x},${options.z}. ${result.error.message}`);
    state = result.value;
  };
  const extract = (resource: RawResource, x: number, z: number, rotation: Direction) =>
    place({ buildingType: 'extractor', resource, x, z, rotation });
  const process = (recipe: RecipeId, x: number, z: number, rotation: Direction) =>
    place({ buildingType: 'processor', recipe, x, z, rotation });
  const belt = (x: number, z: number, rotation: Direction) => place({ buildingType: 'conveyor', x, z, rotation });
  const lift = (x: number, z: number, rotation: Direction) => place({ buildingType: 'lift', x, z, rotation });

  // Electronics: board, chip and wire converge at the programming station.
  extract('resin', 2, 5, east);
  process('pellets', 3, 5, east);
  extract('sand', 4, 6, north);
  process('plastic', 4, 5, north);
  extract('copper', 2, 4, east);
  process('copper-foil', 3, 4, east);
  process('board', 4, 4, east);
  belt(5, 4, east);

  extract('sand', 9, 5, west);
  process('silicon', 8, 5, north);
  extract('copper', 8, 2, south);
  process('wire', 8, 3, south);
  process('chip', 8, 4, west);
  belt(7, 4, west);

  extract('copper', 6, 8, north);
  process('wire', 6, 7, north);
  extract('resin', 5, 7, north);
  process('pellets', 5, 6, east);
  process('insulated-wire', 6, 6, north);
  belt(6, 5, north);
  process('programmable-board', 6, 4, north);
  belt(6, 3, north);
  lift(6, 2, south);

  level = 1;
  lift(6, 2, south);
  process('controller', 6, 3, south);
  lift(6, 4, south);

  // The frame and rotors use their own polymer lines.
  extract('resin', 2, 2, east);
  process('pellets', 3, 2, east);
  extract('sand', 5, 2, west);
  process('plastic', 4, 2, south);
  extract('ore', 2, 3, east);
  process('plate', 3, 3, east);
  process('frame', 4, 3, south);
  lift(4, 4, south);

  extract('resin', 3, 9, north);
  process('pellets', 3, 8, east);
  extract('sand', 5, 8, west);
  process('plastic', 4, 8, north);
  process('rotors', 4, 7, north);
  lift(4, 6, north);

  extract('ore', 0, 6, east);
  process('plate', 1, 6, east);
  extract('copper', 2, 8, north);
  process('wire', 2, 7, north);
  process('alloy', 2, 6, north);
  extract('copper', 0, 5, east);
  process('wire', 1, 5, east);
  process('motors', 2, 5, east);
  lift(3, 5, east);

  extract('lithium', 8, 3, south);
  extract('copper', 9, 4, west);
  process('cell', 8, 4, south);
  extract('copper', 9, 6, west);
  process('wire', 8, 6, north);
  process('battery', 8, 5, west);
  lift(7, 5, west);

  level = 2;
  lift(6, 4, south);
  lift(7, 5, west);
  process('avionics', 6, 5, west);
  lift(4, 4, south);
  lift(3, 5, east);
  lift(4, 6, north);
  process('airframe', 4, 5, east);
  process('drone', 5, 5, south);
  belt(5, 6, south);
  process('ship-drone', 5, 7, south);

  const generators = Math.ceil(getEnergyStats(state).demand / BUILDING_SPECS.generator.power);
  for (let index = 0; index < generators; index++) {
    // Keep the power plant at the unoccupied edge of the first and third floors.
    const column = Math.floor(index / GRID_HEIGHT);
    level = column % 2 === 0 ? 0 : 2;
    place({ buildingType: 'generator', x: Math.floor(column / 2), z: index % GRID_HEIGHT, rotation: south });
  }
  state.credits = INITIAL_CREDITS;
  return state;
}
