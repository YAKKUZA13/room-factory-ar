import { applyCommand } from './commands';
import { createInitialFactoryState } from './initial-world';
import type { FactoryState, PlaceCommand } from './types';

/** Two raw-material towers feed assembly on floors 2 and 3; no prefilled buffers. */
export function createTowerDemo(cellSizeMeters = 0.1): FactoryState {
  let state = createInitialFactoryState({factoryId:'two-towers-demo',credits:10000,cellSizeMeters});
  const put = (buildingType: PlaceCommand['buildingType'], x: number, z: number, rotation: PlaceCommand['rotation'], level: number, config: Partial<PlaceCommand> = {}) => {
    const result = applyCommand(state, {type:'place',buildingType,x,z,rotation,level,...config});
    if (!result.ok) throw new Error(result.error.message);
    state = result.value;
  };
  for (let z = 0; z < 5; z++) put('generator',0,z,0,0);
  put('extractor',1,3,1,0); put('processor',2,3,1,0,{recipe:'plate'});
  put('extractor',7,3,3,0,{resource:'copper'}); put('processor',6,3,3,0,{recipe:'wire'});
  put('extractor',1,5,1,0); put('processor',2,5,1,0,{recipe:'plate'});
  for (const level of [0,1]) {put('lift',3,3,1,level);put('lift',5,3,3,level);}
  put('processor',4,3,0,1,{recipe:'alloy'});
  put('lift',4,4,0,1);put('lift',4,4,0,2);
  for (const level of [0,1,2]) put('lift',3,5,1,level);
  put('processor',4,5,0,2,{recipe:'module'});
  put('conveyor',4,6,0,2);put('processor',4,7,0,2,{recipe:'export'});
  state.credits = 120;
  return state;
}
