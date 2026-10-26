import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/constants';
import { FactoryEngine } from '../../src/core/simulation';
import {
  createPersistedSave,
  defaultPreferences,
  defaultTutorialState,
  validatePersistedSave,
} from '../../src/persistence/migrations';
import { MemoryStorage, SaveRepository } from '../../src/persistence/save-repository';
import { exportSaveToJson, parseSaveImport } from '../../src/persistence/import-export';
import { buildWorkingChain, must } from '../helpers';

function makeSave() {
  const engine = new FactoryEngine(buildWorkingChain());
  for (let i = 0; i < 70; i += 1) engine.step(FIXED_DT);
  return createPersistedSave(
    engine.state,
    { kind: 'unbound' },
    defaultTutorialState(),
    defaultPreferences(),
    new Date('2026-10-26T12:00:00.000Z'),
  );
}

describe('persisted save validation', () => {
  it('round-trips a valid save through the repository', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const save = makeSave();
    expect(repository.save(save).ok).toBe(true);
    const loaded = repository.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.save.factory.credits).toBe(save.factory.credits);
      expect(loaded.save.schemaVersion).toBe(1);
      expect(loaded.save.factory.buildings).toHaveLength(4);
    }
  });

  it('returns empty for a fresh storage', () => {
    const repository = new SaveRepository(new MemoryStorage());
    expect(repository.load().status).toBe('empty');
  });

  it('reports corrupt JSON without throwing and preserves raw data', () => {
    const storage = new MemoryStorage();
    storage.setItem('room-factory-ar/save/v1', '{broken');
    const repository = new SaveRepository(storage);
    const loaded = repository.load();
    expect(loaded.status).toBe('corrupt');
    if (loaded.status === 'corrupt') {
      expect(loaded.raw).toBe('{broken');
      expect(loaded.error.code).toBe('corrupt-save');
    }
  });

  it('rejects unknown schema versions instead of guessing', () => {
    const save = makeSave();
    const raw = JSON.parse(exportSaveToJson(save)) as Record<string, unknown>;
    raw.schemaVersion = 2;
    const result = validatePersistedSave(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported-save-version');
  });

  it('rejects a marker anchor with an unknown marker name', () => {
    const save = makeSave();
    const raw = JSON.parse(exportSaveToJson(save)) as Record<string, unknown>;
    raw.anchor = {
      kind: 'marker',
      markerName: 'some-old-marker',
      markerToFactory: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      bindingVersion: 1,
    };
    const result = validatePersistedSave(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('corrupt-save');
  });

  it('rejects a non-normalized zero quaternion in T_M_F', () => {
    const save = makeSave();
    const raw = JSON.parse(exportSaveToJson(save)) as Record<string, unknown>;
    raw.anchor = {
      kind: 'marker',
      markerName: 'room-factory-marker',
      markerToFactory: { position: [0, 0, 0], quaternion: [0, 0, 0, 0] },
      bindingVersion: 1,
    };
    expect(validatePersistedSave(raw).ok).toBe(false);
  });

  it('reports storage unavailable when localStorage is blocked', () => {
    const repository = new SaveRepository(null);
    expect(repository.isAvailable()).toBe(false);
    const loaded = repository.load();
    expect(loaded.status).toBe('unavailable');
    expect(makeSave()).toBeTruthy();
    const result = repository.save(makeSave());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('storage-unavailable');
  });

  it('maps quota errors to a recoverable storage error', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      },
      removeItem: () => undefined,
    };
    const repository = new SaveRepository(throwing);
    const result = repository.save(makeSave());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('storage-unavailable');
      expect(result.error.message).toMatch(/Экспорт/i);
    }
  });
});

describe('import / export', () => {
  it('exports and imports the same save', () => {
    const save = makeSave();
    const text = exportSaveToJson(save);
    const parsed = parseSaveImport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.factory.credits).toBe(save.factory.credits);
      expect(parsed.value.anchor).toEqual(save.anchor);
    }
  });

  it('rejects malformed and oversized imports', () => {
    expect(parseSaveImport('not json').ok).toBe(false);
    const huge = 'x'.repeat(600 * 1024);
    const result = parseSaveImport(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-import');
  });

  it('does not execute code from imported JSON', () => {
    const save = makeSave();
    const raw = JSON.parse(exportSaveToJson(save)) as Record<string, unknown>;
    (raw.factory as Record<string, unknown>).credits = 'alert(1)';
    const result = parseSaveImport(JSON.stringify(raw));
    expect(result.ok).toBe(false);
  });
});

describe('save with marker anchor', () => {
  it('keeps marker anchor across save/load', () => {
    const storage = new MemoryStorage();
    const repository = new SaveRepository(storage);
    const save = makeSave();
    save.anchor = {
      kind: 'marker',
      markerName: 'room-factory-marker',
      markerToFactory: {
        position: [0.25, 0, -0.4],
        quaternion: [0, 0.38268343, 0, 0.92387953],
      },
      bindingVersion: 1,
    };
    expect(repository.save(save).ok).toBe(true);
    const loaded = repository.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.save.anchor.kind).toBe('marker');
      expect(must(validatePersistedSave(loaded.save)).anchor.kind).toBe('marker');
    }
  });
});
