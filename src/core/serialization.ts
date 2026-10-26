import {
  BUILDING_SPECS,
  BUILDING_TYPES,
  FIXED_DT,
  GRID_HEIGHT,
  GRID_WIDTH,
  MAX_BUILDING_ID_LENGTH,
  MAX_FACTORY_ID_LENGTH,
} from './constants';
import {
  cellKey,
  isDirection,
  isInsideGrid,
  validateCellSize,
} from './grid';
import type {
  Building,
  BuildingType,
  DomainError,
  FactoryState,
  ItemType,
} from './types';
import { domainError, err, ok, type Result } from './types';

const MAX_CREDITS = 1_000_000_000_000;
const MAX_STARTER_PER_TYPE = 100;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function invalid(message: string, details?: Record<string, unknown>): Result<never> {
  return err(domainError('invalid-state', message, details));
}

function parseBuilding(
  input: unknown,
  index: number,
): Result<Building, DomainError> {
  if (!isRecord(input)) return invalid(`Здание #${index} не является объектом.`);
  const { id, type, x, z, rotation, progress, buffer, purchaseSource, enabled } = input;

  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_BUILDING_ID_LENGTH) {
    return invalid(`Некорректный ID здания #${index}.`);
  }
  if (!BUILDING_TYPES.includes(type as BuildingType)) {
    return invalid(`Некорректный тип здания #${index}.`, { type });
  }
  if (!isInsideGrid(x as number, z as number)) {
    return invalid(`Координаты здания ${id} вне сетки.`, { x, z });
  }
  if (!isDirection(rotation)) {
    return invalid(`Некорректный поворот здания ${id}.`, { rotation });
  }
  const spec = BUILDING_SPECS[type as BuildingType];
  if (
    !isFiniteNumber(progress) ||
    progress < -1e-9 ||
    progress > spec.cycleSeconds + FIXED_DT
  ) {
    return invalid(`Некорректный progress здания ${id}.`, { progress });
  }
  if (!Array.isArray(buffer)) {
    return invalid(`Некорректный буфер здания ${id}.`);
  }
  if (buffer.length > spec.bufferCapacity) {
    return invalid(`Буфер здания ${id} превышает ёмкость.`, {
      length: buffer.length,
      capacity: spec.bufferCapacity,
    });
  }
  const normalizedBuffer: ItemType[] = [];
  for (const item of buffer) {
    if (item !== 'ore') {
      return invalid(`Неизвестный предмет в буфере здания ${id}.`, { item });
    }
    normalizedBuffer.push('ore');
  }
  if (purchaseSource !== 'starter' && purchaseSource !== 'credits') {
    return invalid(`Некорректный источник покупки здания ${id}.`, { purchaseSource });
  }
  if (typeof enabled !== 'boolean') {
    return invalid(`Некорректный флаг enabled здания ${id}.`);
  }

  return ok({
    id,
    type: type as BuildingType,
    x: x as number,
    z: z as number,
    rotation,
    progress: Math.max(0, progress),
    buffer: normalizedBuffer,
    purchaseSource,
    enabled,
  });
}

/**
 * Runtime validation for FactoryState. Returns a freshly constructed state so
 * unknown properties from imported JSON never leak into the game model.
 */
export function validateFactoryState(input: unknown): Result<FactoryState, DomainError> {
  if (!isRecord(input)) return invalid('Сохранение не является объектом.');

  if (input.schemaVersion !== 1) {
    return err(
      domainError('unsupported-save-version', 'Неподдерживаемая версия сохранения.', {
        schemaVersion: input.schemaVersion,
      }),
    );
  }
  if (
    typeof input.factoryId !== 'string' ||
    input.factoryId.length === 0 ||
    input.factoryId.length > MAX_FACTORY_ID_LENGTH
  ) {
    return invalid('Некорректный factoryId.');
  }
  if (input.width !== GRID_WIDTH || input.height !== GRID_HEIGHT) {
    return invalid('Ожидается сетка 10×10.', {
      width: input.width,
      height: input.height,
    });
  }
  if (!validateCellSize(input.cellSizeMeters)) {
    return invalid('Некорректный физический размер клетки.', {
      cellSizeMeters: input.cellSizeMeters,
    });
  }
  if (!isIntegerInRange(input.credits, 0, MAX_CREDITS)) {
    return invalid('Кредиты должны быть целым неотрицательным числом.', {
      credits: input.credits,
    });
  }
  if (!isIntegerInRange(input.totalPartsSold, 0, MAX_CREDITS)) {
    return invalid('Некорректный счётчик проданных деталей.');
  }
  if (!isFiniteNumber(input.simulationTimeSeconds) || input.simulationTimeSeconds < 0) {
    return invalid('Некорректное время симуляции.');
  }
  if (typeof input.isPaused !== 'boolean') {
    return invalid('Некорректный флаг паузы.');
  }
  if (!isIntegerInRange(input.nextBuildingOrdinal, 1, MAX_CREDITS)) {
    return invalid('Некорректный nextBuildingOrdinal.');
  }
  if (!isRecord(input.starterInventory)) {
    return invalid('Некорректный стартовый комплект.');
  }
  if (!Array.isArray(input.buildings)) {
    return invalid('Список зданий должен быть массивом.');
  }
  if (input.buildings.length > GRID_WIDTH * GRID_HEIGHT) {
    return invalid('Слишком много зданий.');
  }

  const starterInventory = {} as Record<BuildingType, number>;
  for (const type of BUILDING_TYPES) {
    const value = input.starterInventory[type];
    if (!isIntegerInRange(value, 0, MAX_STARTER_PER_TYPE)) {
      return invalid(`Некорректный стартовый запас для ${type}.`, { value });
    }
    starterInventory[type] = value;
  }

  const buildings: Building[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (let i = 0; i < input.buildings.length; i += 1) {
    const parsed = parseBuilding(input.buildings[i], i);
    if (!parsed.ok) return parsed;
    const building = parsed.value;
    if (ids.has(building.id)) {
      return invalid(`Дублирующийся ID здания: ${building.id}.`);
    }
    ids.add(building.id);
    const key = cellKey(building.x, building.z);
    if (cells.has(key)) {
      return invalid(`Две постройки в одной клетке: ${key}.`);
    }
    cells.add(key);
    buildings.push(building);
  }

  return ok({
    schemaVersion: 1,
    factoryId: input.factoryId,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    cellSizeMeters: input.cellSizeMeters,
    credits: input.credits,
    totalPartsSold: input.totalPartsSold,
    buildings,
    starterInventory,
    simulationTimeSeconds: input.simulationTimeSeconds,
    isPaused: input.isPaused,
    nextBuildingOrdinal: input.nextBuildingOrdinal,
  });
}

export function serializeFactory(state: FactoryState, pretty = false): string {
  return JSON.stringify(state, null, pretty ? 2 : undefined);
}

export function deserializeFactory(json: string): Result<FactoryState, DomainError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return err(domainError('corrupt-save', 'JSON сохранения повреждён.'));
  }
  return validateFactoryState(parsed);
}
