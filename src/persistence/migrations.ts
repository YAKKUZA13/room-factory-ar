import { MARKER_TARGET_NAME, SAVE_SCHEMA_VERSION } from '../core/constants';
import { validateCellSize } from '../core/grid';
import { validateFactoryState } from '../core/serialization';
import type { DomainError, FactoryState, Result } from '../core/types';
import { domainError, err, ok } from '../core/types';
import { isValidAnchor } from '../ar/anchor-manager';
import type { AnchorState } from '../ar/tracking-port';
import { normalizePose } from '../ar/transforms';

export interface TutorialState {
  /** 0..5; 5 means the five tutorial milestones were reached. */
  step: number;
  complete: boolean;
}

export interface Preferences {
  showGrid: boolean;
  muted: boolean;
  performanceMode: 'auto' | 'low' | 'high';
}

export interface PersistedSaveV1 {
  schemaVersion: 1;
  savedAtISO: string;
  factory: FactoryState;
  anchor: AnchorState;
  tutorial: TutorialState;
  preferences: Preferences;
}

export function defaultTutorialState(): TutorialState {
  return { step: 0, complete: false };
}

export function defaultPreferences(): Preferences {
  return { showGrid: true, muted: true, performanceMode: 'auto' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateTutorialState(input: unknown): Result<TutorialState, DomainError> {
  if (!isRecord(input)) {
    return err(domainError('corrupt-save', 'Некорректное состояние обучения.'));
  }
  const step = input.step;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 5) {
    return err(domainError('corrupt-save', 'Шаг обучения вне диапазона 0..5.'));
  }
  if (typeof input.complete !== 'boolean') {
    return err(domainError('corrupt-save', 'Некорректный флаг завершения обучения.'));
  }
  return ok({ step, complete: input.complete });
}

export function validatePreferences(input: unknown): Result<Preferences, DomainError> {
  if (!isRecord(input)) {
    return err(domainError('corrupt-save', 'Некорректные настройки.'));
  }
  if (typeof input.showGrid !== 'boolean' || typeof input.muted !== 'boolean') {
    return err(domainError('corrupt-save', 'Некорректные настройки отображения/звука.'));
  }
  const mode = input.performanceMode;
  if (mode !== 'auto' && mode !== 'low' && mode !== 'high') {
    return err(domainError('corrupt-save', 'Некорректный режим производительности.'));
  }
  return ok({
    showGrid: input.showGrid,
    muted: input.muted,
    performanceMode: mode,
  });
}

export function validateAnchorState(
  input: unknown,
  expectedMarkerName: string = MARKER_TARGET_NAME,
): Result<AnchorState, DomainError> {
  if (!isRecord(input)) {
    return err(domainError('corrupt-save', 'Некорректная привязка завода.'));
  }
  if (input.kind === 'unbound') {
    return ok({ kind: 'unbound' });
  }
  if (input.kind !== 'marker') {
    return err(domainError('corrupt-save', 'Неизвестный тип привязки.'));
  }
  if (input.bindingVersion !== 1) {
    return err(domainError('unsupported-save-version', 'Неизвестная версия привязки.'));
  }
  if (input.markerName !== expectedMarkerName) {
    return err(
      domainError('corrupt-save', 'Привязка ссылается на неизвестную карточку.', {
        expected: expectedMarkerName,
        received: input.markerName,
      }),
    );
  }
  if (!isValidAnchor(input)) {
    return err(domainError('corrupt-save', 'Некорректная матрица привязки к карточке.'));
  }
  const candidate = input as unknown as Extract<AnchorState, { kind: 'marker' }>;
  const markerToFactory = candidate.markerToFactory;
  if (!markerToFactory || typeof markerToFactory !== 'object') {
    return err(domainError('corrupt-save', 'Нет T_M_F в сохранении.'));
  }
  let normalized;
  try {
    normalized = normalizePose(markerToFactory);
  } catch {
    return err(domainError('corrupt-save', 'T_M_F содержит недопустимые числа.'));
  }
  return ok({
    kind: 'marker',
    markerName: expectedMarkerName,
    markerToFactory: normalized,
    bindingVersion: 1,
  });
}

/**
 * Validates a full save document. This is intentionally strict: any unknown or
 * malformed field results in the recovery UI rather than a half-loaded factory.
 */
export function validatePersistedSave(
  input: unknown,
  expectedMarkerName: string = MARKER_TARGET_NAME,
): Result<PersistedSaveV1, DomainError> {
  if (!isRecord(input)) {
    return err(domainError('corrupt-save', 'Сохранение не является объектом.'));
  }
  if (input.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return err(
      domainError('unsupported-save-version', 'Неподдерживаемая версия сохранения.', {
        schemaVersion: input.schemaVersion,
      }),
    );
  }
  if (typeof input.savedAtISO !== 'string' || !Number.isFinite(Date.parse(input.savedAtISO))) {
    return err(domainError('corrupt-save', 'Некорректная дата сохранения.'));
  }
  const factory = validateFactoryState(input.factory);
  if (!factory.ok) return factory;
  if (!validateCellSize(factory.value.cellSizeMeters)) {
    return err(domainError('corrupt-save', 'Некорректный масштаб клетки.'));
  }
  const anchor = validateAnchorState(input.anchor, expectedMarkerName);
  if (!anchor.ok) return anchor;
  const tutorial = validateTutorialState(input.tutorial);
  if (!tutorial.ok) return tutorial;
  const preferences = validatePreferences(input.preferences);
  if (!preferences.ok) return preferences;

  return ok({
    schemaVersion: 1,
    savedAtISO: input.savedAtISO,
    factory: factory.value,
    anchor: anchor.value,
    tutorial: tutorial.value,
    preferences: preferences.value,
  });
}

/**
 * Future schema migrations must be explicit. Until a real V2 exists, any other
 * version is rejected instead of guessed (SPEC.md §9.3).
 */
export function migratePersistedSave(
  input: unknown,
  expectedMarkerName: string = MARKER_TARGET_NAME,
): Result<PersistedSaveV1, DomainError> {
  if (!isRecord(input)) {
    return err(domainError('corrupt-save', 'Сохранение не является объектом.'));
  }
  if (input.schemaVersion === SAVE_SCHEMA_VERSION) {
    return validatePersistedSave(input, expectedMarkerName);
  }
  return err(
    domainError('unsupported-save-version', 'Нет миграции для этой версии сохранения.', {
      schemaVersion: input.schemaVersion,
    }),
  );
}

export function createPersistedSave(
  factory: FactoryState,
  anchor: AnchorState,
  tutorial: TutorialState,
  preferences: Preferences,
  now: Date = new Date(),
): PersistedSaveV1 {
  return {
    schemaVersion: 1,
    savedAtISO: now.toISOString(),
    factory,
    anchor,
    tutorial,
    preferences,
  };
}
