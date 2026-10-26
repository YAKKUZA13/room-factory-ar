import { MAX_IMPORT_BYTES, SAVE_KEY } from '../core/constants';
import type { DomainError, Result } from '../core/types';
import { domainError, err, ok } from '../core/types';
import type { PersistedSaveV1 } from './migrations';
import { migratePersistedSave } from './migrations';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadSaveResult =
  | { status: 'empty' }
  | { status: 'ok'; save: PersistedSaveV1; raw: string }
  | { status: 'corrupt'; error: DomainError; raw: string | null }
  | { status: 'unavailable'; error: DomainError };

export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Returns null when localStorage is blocked (Safari private mode, policy, quota probe). */
export function createBrowserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    const probe = '__room_factory_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export class SaveRepository {
  private readonly storage: StorageLike | null;
  private readonly key: string;

  constructor(storage: StorageLike | null, key: string = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  isAvailable(): boolean {
    return this.storage !== null;
  }

  getKey(): string {
    return this.key;
  }

  load(): LoadSaveResult {
    if (!this.storage) {
      return {
        status: 'unavailable',
        error: domainError(
          'storage-unavailable',
          'localStorage недоступен. Игра работает, но прогресс не сохранится.',
        ),
      };
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      return {
        status: 'unavailable',
        error: domainError('storage-unavailable', 'Не удалось прочитать localStorage.', {
          error: String(error),
        }),
      };
    }
    if (raw === null) return { status: 'empty' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        status: 'corrupt',
        error: domainError('corrupt-save', 'Сохранение содержит некорректный JSON.'),
        raw,
      };
    }
    const migrated = migratePersistedSave(parsed);
    if (!migrated.ok) {
      return { status: 'corrupt', error: migrated.error, raw };
    }
    return { status: 'ok', save: migrated.value, raw };
  }

  save(save: PersistedSaveV1): Result<void, DomainError> {
    if (!this.storage) {
      return err(
        domainError('storage-unavailable', 'localStorage недоступен — используйте экспорт JSON.'),
      );
    }
    let payload: string;
    try {
      payload = JSON.stringify(save);
    } catch (error) {
      return err(
        domainError('internal-error', 'Не удалось сериализовать сохранение.', {
          error: String(error),
        }),
      );
    }
    try {
      this.storage.setItem(this.key, payload);
      return ok(undefined);
    } catch (error) {
      const name = (error as { name?: string }).name ?? '';
      return err(
        domainError(
          'storage-unavailable',
          name === 'QuotaExceededError'
            ? 'Хранилище переполнено. Экспортируйте завод в JSON.'
            : 'Не удалось записать сохранение. Экспортируйте завод в JSON.',
          { error: String(error), name },
        ),
      );
    }
  }

  clear(): Result<void, DomainError> {
    if (!this.storage) {
      return err(domainError('storage-unavailable', 'localStorage недоступен.'));
    }
    try {
      this.storage.removeItem(this.key);
      return ok(undefined);
    } catch (error) {
      return err(
        domainError('storage-unavailable', 'Не удалось очистить сохранение.', {
          error: String(error),
        }),
      );
    }
  }

  readRaw(): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(this.key);
    } catch {
      return null;
    }
  }

  writeRaw(raw: string): Result<void, DomainError> {
    if (!this.storage) {
      return err(domainError('storage-unavailable', 'localStorage недоступен.'));
    }
    if (raw.length > MAX_IMPORT_BYTES) {
      return err(domainError('invalid-import', 'Сохранение слишком большое.'));
    }
    try {
      this.storage.setItem(this.key, raw);
      return ok(undefined);
    } catch (error) {
      return err(
        domainError('storage-unavailable', 'Не удалось записать сохранение.', {
          error: String(error),
        }),
      );
    }
  }
}
