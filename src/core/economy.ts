import { BUILDING_SPECS, PART_PRICE_CREDITS, REFUND_RATE } from './constants';
import type {
  Building,
  BuildingType,
  EnergyStats,
  FactoryState,
} from './types';

export function buildingCost(type: BuildingType): number {
  return BUILDING_SPECS[type].cost;
}

export function bufferCapacity(type: BuildingType): number {
  return BUILDING_SPECS[type].bufferCapacity;
}

export function getEnergyStats(state: FactoryState): EnergyStats {
  let supply = 0;
  let demand = 0;
  let generators = 0;
  let activeExtractors = 0;
  let activeProcessors = 0;

  for (const building of state.buildings) {
    if (!building.enabled) continue;
    if (building.type === 'generator') {
      generators += 1;
      supply += BUILDING_SPECS.generator.power;
    } else if (building.type === 'extractor') {
      activeExtractors += 1;
      demand += Math.abs(BUILDING_SPECS.extractor.power);
    } else if (building.type === 'processor') {
      activeProcessors += 1;
      demand += Math.abs(BUILDING_SPECS.processor.power);
    }
  }

  return {
    supply,
    demand,
    brownout: supply < demand,
    generators,
    activeExtractors,
    activeProcessors,
  };
}

/**
 * Refund for removing a building. Starter buildings return their starter slot,
 * not credits; this function only computes the credit side.
 */
export function refundCreditsFor(building: Building): number {
  if (building.purchaseSource === 'starter') return 0;
  return Math.floor(buildingCost(building.type) * REFUND_RATE);
}

/** Theoretical processor throughput at full power, used in diagnostics. */
export function theoreticalPartsPerMinute(state: FactoryState, brownout: boolean): number {
  if (brownout || state.isPaused) return 0;
  let processors = 0;
  for (const building of state.buildings) {
    if (building.type === 'processor' && building.enabled) processors += 1;
  }
  return Math.round((processors * 60) / BUILDING_SPECS.processor.cycleSeconds);
}

export function creditsPerMinute(): number {
  return Math.round((60 / BUILDING_SPECS.processor.cycleSeconds) * PART_PRICE_CREDITS);
}

export interface PlacementPrice {
  source: 'starter' | 'credits';
  credits: number;
}

/** Returns null when the player can neither use a starter slot nor pay. */
export function placementPrice(
  state: FactoryState,
  type: BuildingType,
): PlacementPrice | null {
  if (state.starterInventory[type] > 0) {
    return { source: 'starter', credits: 0 };
  }
  const cost = buildingCost(type);
  if (state.credits < cost) return null;
  return { source: 'credits', credits: cost };
}
