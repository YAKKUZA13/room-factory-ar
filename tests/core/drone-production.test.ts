import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/constants';
import { createDroneDemo } from '../../src/core/drone-demo';
import { DAILY_ORDERS, dailyProductionFor } from '../../src/core/production';
import { RECIPES } from '../../src/core/recipes';
import { deserializeFactory, serializeFactory, validateFactoryState } from '../../src/core/serialization';
import { simulateStep } from '../../src/core/simulation';
import { createTowerDemo } from '../../src/core/tower-demo';
import type { FactoryState, ItemType } from '../../src/core/types';
import { must } from '../helpers';

function run(state: FactoryState, seconds: number, day: string, cargo?: Set<ItemType>): FactoryState {
  for (let tick = 0; tick < Math.round(seconds / FIXED_DT); tick++) {
    const next = simulateStep(state, FIXED_DT, day);
    for (const event of next.events) {
      if (event.type === 'transfer') cargo?.add(event.item);
    }
    state = next.state;
  }
  return state;
}

describe('drone production', () => {
  const firstDay = '2026-11-25';
  const secondDay = '2026-11-26';

  it('assembles, transports and sells drones using extracted resources and grants each daily reward once', () => {
    const start = createDroneDemo();
    expect(start.buildings.every((building) => !building.buffer.length && !building.output?.length)).toBe(true);
    const cargo = new Set<ItemType>();
    const after = run(start, 120, firstDay, cargo);
    expect([...cargo]).toEqual(expect.arrayContaining([
      'resin', 'pellets', 'sand', 'plastic', 'copper-foil', 'silicon', 'chip', 'board', 'wire', 'insulated-wire',
      'programmable-board', 'controller',
      'frame', 'motors', 'rotors', 'lithium', 'cell', 'battery', 'airframe', 'avionics', 'drone',
    ]));
    expect(start.production).toEqual({ dronesBuilt: 0, dronesSold: 0, daily: null });
    expect(after.production.dronesSold).toBeGreaterThan(5);
    expect(after.production.dronesBuilt).toBeGreaterThanOrEqual(after.production.dronesSold);
    expect(after.totalPartsSold).toBe(after.production.dronesSold);
    expect(after.production.daily).toEqual({
      day: firstDay,
      sales: after.totalPartsSold,
      dronesBuilt: after.production.dronesBuilt,
      dronesSold: after.production.dronesSold,
    });
    const rewards = DAILY_ORDERS.reduce((total, order) => total + order.reward, 0);
    expect(after.credits).toBe(start.credits + after.totalPartsSold * RECIPES['ship-drone'].credits! + rewards);

    const restored = must(deserializeFactory(serializeFactory(after)));
    expect(restored.production).toEqual(after.production);
    const sameDay = run(restored, 60, firstDay);
    expect(sameDay.credits - after.credits).toBe((sameDay.totalPartsSold - after.totalPartsSold) * RECIPES['ship-drone'].credits!);
    expect(dailyProductionFor(sameDay.production, secondDay)).toEqual({
      day: secondDay, sales: 0, dronesBuilt: 0, dronesSold: 0,
    });
    const tomorrow = run(sameDay, 90, secondDay);
    expect(tomorrow.production.daily?.day).toBe(secondDay);
    expect(tomorrow.production.daily?.dronesSold).toBe(tomorrow.production.dronesSold - sameDay.production.dronesSold);
    expect(tomorrow.credits - sameDay.credits).toBe((tomorrow.totalPartsSold - sameDay.totalPartsSold) * RECIPES['ship-drone'].credits! + rewards);
  });

  it('keeps legacy sales when initializing production progress and rejects malformed daily history', () => {
    const { production: _production, ...legacy } = createTowerDemo();
    legacy.totalPartsSold = 4;
    const restored = must(validateFactoryState(legacy));
    expect(restored.totalPartsSold).toBe(4);
    expect(restored.production).toEqual({ dronesBuilt: 0, dronesSold: 0, daily: null });
    restored.production.daily = { day: '2026-11-31', sales: 0, dronesBuilt: 0, dronesSold: 0 };
    expect(validateFactoryState(restored).ok).toBe(false);
  });
});
