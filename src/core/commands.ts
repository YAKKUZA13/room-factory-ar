import { BUILDING_SPECS, BUILDING_TYPES } from './constants';
import { buildingCost, placementPrice } from './economy';
import { buildOccupancy, cellKey, isDirection, isInsideGrid, nextDirection } from './grid';
import { createInitialFactoryState } from './initial-world';
import { cloneFactoryState } from './state';
import type {
  Building,
  BuildingId,
  DomainError,
  DomainErrorCode,
  FactoryCommand,
  FactoryState,
  Result,
} from './types';
import { domainError, err, ok } from './types';

function fail(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<never> {
  return err(domainError(code, message, details));
}

function findIndex(state: FactoryState, id: BuildingId): number {
  return state.buildings.findIndex((building) => building.id === id);
}

function nextFreeId(state: FactoryState): { id: string; nextOrdinal: number } {
  let ordinal = Math.max(1, Math.floor(state.nextBuildingOrdinal));
  let id = `b${ordinal}`;
  const used = new Set(state.buildings.map((building) => building.id));
  while (used.has(id)) {
    ordinal += 1;
    id = `b${ordinal}`;
  }
  return { id, nextOrdinal: ordinal + 1 };
}

/**
 * Pure command application. On any error the original state is returned untouched
 * (never partially mutated), satisfying SPEC.md §5.1.
 */
export function applyCommand(
  state: FactoryState,
  command: FactoryCommand,
): Result<FactoryState, DomainError> {
  switch (command.type) {
    case 'place':
      return placeBuilding(state, command);
    case 'rotate':
      return rotateBuilding(state, command.id, command.clockwise);
    case 'remove':
      return removeBuilding(state, command.id);
    case 'toggle':
      return toggleBuilding(state, command.id, command.enabled);
    case 'pause': {
      if (typeof command.paused !== 'boolean') {
        return fail('invalid-command', 'Некорректное значение паузы.');
      }
      if (state.isPaused === command.paused) return ok(state);
      const next = cloneFactoryState(state);
      next.isPaused = command.paused;
      return ok(next);
    }
    case 'reset-factory': {
      // Keep the calibrated physical scale, start everything else from scratch.
      return ok(
        createInitialFactoryState({
          cellSizeMeters: state.cellSizeMeters,
        }),
      );
    }
    default: {
      const exhaustive: never = command;
      return fail('invalid-command', 'Неизвестная команда.', {
        command: exhaustive,
      });
    }
  }
}

function placeBuilding(
  state: FactoryState,
  command: Extract<FactoryCommand, { type: 'place' }>,
): Result<FactoryState, DomainError> {
  if (!BUILDING_TYPES.includes(command.buildingType)) {
    return fail('invalid-building-type', 'Неизвестный тип здания.', {
      buildingType: command.buildingType,
    });
  }
  if (!isInsideGrid(command.x, command.z)) {
    return fail('out-of-bounds', 'Клетка вне сетки 10×10.', {
      x: command.x,
      z: command.z,
    });
  }
  if (!isDirection(command.rotation)) {
    return fail('invalid-rotation', 'Поворот должен быть кратен 90°.', {
      rotation: command.rotation,
    });
  }
  const occupancy = buildOccupancy(state.buildings);
  if (occupancy.has(cellKey(command.x, command.z))) {
    return fail('occupied', 'Клетка уже занята.', {
      x: command.x,
      z: command.z,
    });
  }
  if (state.buildings.length >= state.width * state.height) {
    return fail('size-limit', 'Достигнут лимит зданий.');
  }

  const price = placementPrice(state, command.buildingType);
  if (price === null) {
    return fail(
      'insufficient-credits',
      `Недостаточно кредитов: нужно ${buildingCost(command.buildingType)}.`,
      { cost: buildingCost(command.buildingType), credits: state.credits },
    );
  }

  const next = cloneFactoryState(state);
  if (price.source === 'starter') {
    const available = next.starterInventory[command.buildingType];
    if (available <= 0) {
      return fail('insufficient-credits', 'Стартовый комплект исчерпан.');
    }
    next.starterInventory[command.buildingType] = available - 1;
  } else {
    next.credits = state.credits - price.credits;
  }

  const { id, nextOrdinal } = nextFreeId(next);
  const building: Building = {
    id,
    type: command.buildingType,
    x: command.x,
    z: command.z,
    rotation: command.rotation,
    progress: 0,
    buffer: [],
    purchaseSource: price.source,
    enabled: true,
  };
  next.buildings.push(building);
  next.nextBuildingOrdinal = nextOrdinal;
  return ok(next);
}

function rotateBuilding(
  state: FactoryState,
  id: BuildingId,
  clockwise: boolean,
): Result<FactoryState, DomainError> {
  const index = findIndex(state, id);
  if (index < 0) {
    return fail('building-not-found', 'Здание не найдено.', { id });
  }
  if (typeof clockwise !== 'boolean') {
    return fail('invalid-command', 'Некорректное направление поворота.');
  }
  const next = cloneFactoryState(state);
  const building = next.buildings[index];
  if (!building) return fail('building-not-found', 'Здание не найдено.', { id });
  building.rotation = nextDirection(building.rotation, clockwise);
  // A rotated conveyor keeps its item; the next transfer uses the new direction.
  return ok(next);
}

function removeBuilding(
  state: FactoryState,
  id: BuildingId,
): Result<FactoryState, DomainError> {
  const index = findIndex(state, id);
  if (index < 0) {
    return fail('building-not-found', 'Здание не найдено.', { id });
  }
  const building = state.buildings[index];
  if (!building) return fail('building-not-found', 'Здание не найдено.', { id });

  const next = cloneFactoryState(state);
  next.buildings.splice(index, 1);

  if (building.purchaseSource === 'starter') {
    next.starterInventory[building.type] += 1;
  } else {
    next.credits += Math.floor(BUILDING_SPECS[building.type].cost * 0.5);
  }
  return ok(next);
}

function toggleBuilding(
  state: FactoryState,
  id: BuildingId,
  enabled: boolean,
): Result<FactoryState, DomainError> {
  const index = findIndex(state, id);
  if (index < 0) {
    return fail('building-not-found', 'Здание не найдено.', { id });
  }
  if (typeof enabled !== 'boolean') {
    return fail('invalid-command', 'Некорректное состояние включения.');
  }
  const next = cloneFactoryState(state);
  const building = next.buildings[index];
  if (!building) return fail('building-not-found', 'Здание не найдено.', { id });
  building.enabled = enabled;
  return ok(next);
}
