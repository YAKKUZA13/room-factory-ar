import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/commands';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { getEnergyStats } from '../../src/core/economy';
import { validateFactoryState } from '../../src/core/serialization';
import { simulateStep } from '../../src/core/simulation';
import { createTowerDemo } from '../../src/core/tower-demo';
import { countOre, planTransfers, commitTransfers } from '../../src/core/logistics';
import type { FactoryState, PlaceCommand } from '../../src/core/types';
import { must } from '../helpers';

function put(state: FactoryState, command: Partial<PlaceCommand> = {}): FactoryState {
  return must(applyCommand(state, {type:'place',buildingType:'conveyor',x:2,z:2,rotation:0,...command}));
}
describe('vertical factory', () => {
  it('allows the same cell on separate floors and rejects overlaps on the same floor', () => {
    const a = put(createInitialFactoryState());
    const b = put(a,{level:1});
    expect(b.buildings).toHaveLength(2);
    expect(applyCommand(b,{type:'place',buildingType:'conveyor',x:2,z:2,rotation:0,level:1}).ok).toBe(false);
    expect(validateFactoryState(b).ok).toBe(true);
  });
  it.each([-1,6,1.5,NaN])('rejects an invalid level %s', level => {
    expect(applyCommand(createInitialFactoryState(),{type:'place',buildingType:'lift',x:1,z:1,rotation:0,level}).ok).toBe(false);
  });
  it('does not transfer horizontally between different floors', () => {
    let state = put(createInitialFactoryState()); state = put(state,{z:3,level:1});
    state.buildings[0]!.buffer = ['ore']; state.buildings[0]!.progress = 0.75;
    expect(planTransfers(state,false)).toEqual([]);
  });
  it('moves a resource between paired lifts, then through the upper outlet without duplicating it', () => {
    let state = put(createInitialFactoryState(),{buildingType:'lift'});
    state = put(state,{buildingType:'lift',level:1}); state = put(state,{z:3,level:1});
    state.buildings[0]!.buffer=['copper'];state.buildings[0]!.progress=0.75;
    commitTransfers(state,planTransfers(state,false));
    expect(state.buildings[1]!.buffer).toEqual(['copper']);expect(countOre(state)).toBe(1);
    state.buildings[1]!.progress=0.75;
    commitTransfers(state,planTransfers(state,false));
    expect(state.buildings[2]!.buffer).toEqual(['copper']);expect(countOre(state)).toBe(1);
  });
  it('keeps blocked lifts full and does not move more than one edge in a tick', () => {
    let state = put(createInitialFactoryState(),{buildingType:'lift'});
    state = put(state,{buildingType:'lift',level:1});state = put(state,{buildingType:'lift',level:2});
    state.buildings[0]!.buffer=['ore'];state.buildings[0]!.progress=0.75;
    commitTransfers(state,planTransfers(state,false));
    expect(state.buildings[1]!.buffer).toEqual(['ore']);expect(state.buildings[2]!.buffer).toEqual([]);
    state.buildings[0]!.buffer=['copper'];state.buildings[0]!.progress=0.75;
    expect(planTransfers(state,false)).toEqual([]);
  });
  it('requires both ingredients, preserves blocked output and validates the new save', () => {
    let state = put(createInitialFactoryState({credits:1000}),{buildingType:'generator',x:0});
    state = put(state,{buildingType:'processor',recipe:'alloy'});
    state.buildings[1]!.buffer=['plate'];
    for(let i=0;i<50;i++) state=simulateStep(state,.1).state;
    expect(state.buildings[1]!.output).toEqual([]);
    state.buildings[1]!.buffer.push('wire');
    for(let i=0;i<50;i++) state=simulateStep(state,.1).state;
    expect(state.buildings[1]!.output).toEqual(['alloy']);expect(state.buildings[1]!.buffer).toEqual([]);
    expect(validateFactoryState(state).ok).toBe(true);
  });
  it('restores older ground-floor saves without lift inventory or new fields', () => {
    const raw=JSON.parse(JSON.stringify(put(createInitialFactoryState())));
    delete raw.starterInventory.lift;delete raw.buildings[0].level;
    const result=must(validateFactoryState(raw));
    expect(result.buildings[0]!.level).toBe(0);expect(result.starterInventory.lift).toBe(0);
  });
  it('runs the two-tower fixture from empty buffers through the entire recipe chain and sale', () => {
    let state=createTowerDemo();
    expect(getEnergyStats(state).brownout).toBe(false);
    for(let i=0;i<1500;i++)state=simulateStep(state,.1).state;
    expect(state.totalPartsSold).toBeGreaterThan(0);expect(state.credits).toBeGreaterThan(120);
    expect(must(validateFactoryState(state)).buildings.length).toBe(state.buildings.length);
  });
});
