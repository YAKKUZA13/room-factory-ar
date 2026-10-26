import type { BuildingType, Direction } from './types';

/** Grid is fixed at 10×10 cells for schema version 1. */
export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 10;
export const GRID_CELLS = GRID_WIDTH * GRID_HEIGHT;

/** Fixed simulation step: 10 ticks per second. */
export const FIXED_DT = 0.1;
export const MAX_STEPS_PER_FRAME = 5;
export const MAX_FRAME_DELTA_SECONDS = 0.25;

/** One cell is 10 cm at scale 1.0; the player may shrink the factory to 5 cm cells. */
export const DEFAULT_CELL_SIZE_METERS = 0.1;
export const MIN_CELL_SIZE_METERS = 0.05;
export const MAX_CELL_SIZE_METERS = 0.1;
export const MIN_PLACEMENT_SCALE = 0.5;
export const MAX_PLACEMENT_SCALE = 1.0;

export const INITIAL_CREDITS = 120;
export const STARTER_KIT: Readonly<Record<BuildingType, number>> = {
  generator: 1,
  extractor: 1,
  conveyor: 6,
  processor: 1,
};

export const PART_PRICE_CREDITS = 12;
export const REFUND_RATE = 0.5;

export const MAX_BUILDINGS = GRID_CELLS;
export const MAX_BUILDING_ID_LENGTH = 64;
export const MAX_FACTORY_ID_LENGTH = 128;

export const SAVE_KEY = 'room-factory-ar/save/v1';
export const SAVE_SCHEMA_VERSION = 1 as const;
export const AUTOSAVE_INTERVAL_MS = 10_000;
export const COMMAND_SAVE_DEBOUNCE_MS = 500;
export const MAX_IMPORT_BYTES = 512 * 1024;

export const EXTRACTOR_CYCLE_SECONDS = 2.5;
export const CONVEYOR_MOVE_SECONDS = 0.75;
export const PROCESSOR_CYCLE_SECONDS = 2.5;

export interface BuildingSpec {
  type: BuildingType;
  label: string;
  cost: number;
  /** Positive values feed the shared factory grid; consumers subtract. */
  power: number;
  bufferCapacity: number;
  cycleSeconds: number;
  description: string;
  color: string;
}

export const BUILDING_SPECS: Readonly<Record<BuildingType, BuildingSpec>> = {
  generator: {
    type: 'generator',
    label: 'Генератор',
    cost: 60,
    power: 10,
    bufferCapacity: 0,
    cycleSeconds: 0,
    description: 'Даёт 10 единиц энергии общей сети. Провода не нужны.',
    color: '#E7AB20',
  },
  extractor: {
    type: 'extractor',
    label: 'Добытчик',
    cost: 50,
    power: -4,
    bufferCapacity: 1,
    cycleSeconds: EXTRACTOR_CYCLE_SECONDS,
    description: 'Добывает 1 руду за 2,5 с и выдаёт её вперёд по направлению.',
    color: '#D75F46',
  },
  conveyor: {
    type: 'conveyor',
    label: 'Конвейер',
    cost: 8,
    power: 0,
    bufferCapacity: 1,
    cycleSeconds: CONVEYOR_MOVE_SECONDS,
    description: 'Принимает руду сзади и передаёт вперёд за 0,75 с.',
    color: '#252A2D',
  },
  processor: {
    type: 'processor',
    label: 'Переработчик',
    cost: 80,
    power: -5,
    bufferCapacity: 1,
    cycleSeconds: PROCESSOR_CYCLE_SECONDS,
    description: 'Принимает руду с любой стороны, за 2,5 с делает деталь и продаёт её за 12 credits.',
    color: '#238B9B',
  },
};

export const BUILDING_TYPES: readonly BuildingType[] = [
  'generator',
  'extractor',
  'conveyor',
  'processor',
];

export function isBuildingType(value: unknown): value is BuildingType {
  return value === 'generator' || value === 'extractor' || value === 'conveyor' || value === 'processor';
}

export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3];

export const DIRECTION_LABELS: Readonly<Record<Direction, string>> = {
  0: '+Z (вперёд)',
  1: '+X (вправо)',
  2: '-Z (назад)',
  3: '-X (влево)',
};

/** Arena colours from SPEC.md §7.1. */
export const PALETTE = {
  amber: '#E7AB20',
  graphite: '#252A2D',
  metal: '#CBD3D3',
  teal: '#238B9B',
  light: '#F4E9C9',
  danger: '#D75F46',
  green: '#6FAF6B',
} as const;

export const MARKER_TARGET_NAME = 'room-factory-marker';
export const MARKER_PRINT_WIDTH_MM = 120;
export const MARKER_PRINT_HEIGHT_MM = 160;

/** Thresholds from SPEC.md §4.4. */
export const MARKER_FILTER = {
  minSamples: 8,
  maxSamples: 30,
  minDurationMs: 500,
  maxPositionSpreadMeters: 0.03,
  maxAngleSpreadDegrees: 5,
  maxObservationAgeMs: 350,
  sampleRetentionMs: 4000,
  /** Large observed drift that must be confirmed by the player. */
  correctionConfirmMeters: 0.15,
  correctionConfirmDegrees: 15,
  correctionSmoothingSeconds: 0.45,
} as const;

export const SIMULATION_HISTORY_SECONDS = 60;
