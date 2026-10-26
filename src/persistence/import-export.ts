import { MAX_IMPORT_BYTES } from '../core/constants';
import type { DomainError, Result } from '../core/types';
import { domainError, err, ok } from '../core/types';
import type { PersistedSaveV1 } from './migrations';
import { validatePersistedSave } from './migrations';

export function exportSaveToJson(save: PersistedSaveV1): string {
  return `${JSON.stringify(save, null, 2)}\n`;
}

export function parseSaveImport(text: string): Result<PersistedSaveV1, DomainError> {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_IMPORT_BYTES) {
    return err(
      domainError('invalid-import', 'Файл слишком большой (максимум 512 КБ).', {
        bytes,
      }),
    );
  }
  if (text.trim().length === 0) {
    return err(domainError('invalid-import', 'Файл пуст.'));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err(domainError('invalid-import', 'Файл не является корректным JSON.'));
  }
  return validatePersistedSave(parsed);
}

export function triggerDownload(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next task so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * iOS Safari can be unreliable with programmatic downloads; when the Web Share API
 * accepts files we prefer the share sheet. Otherwise we fall back to a download.
 */
export async function exportSaveFile(save: PersistedSaveV1): Promise<'shared' | 'downloaded'> {
  const text = exportSaveToJson(save);
  const filename = `room-factory-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], filename, { type: 'application/json' });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (
    isIOS &&
    typeof nav.canShare === 'function' &&
    typeof nav.share === 'function' &&
    nav.canShare({ files: [file] })
  ) {
    try {
      await nav.share({ files: [file], title: 'Room Factory AR' });
      return 'shared';
    } catch {
      // User cancelled or share failed; fall through to download.
    }
  }
  triggerDownload(filename, text);
  return 'downloaded';
}

export function readFileAsText(file: File): Promise<Result<string, DomainError>> {
  if (file.size > MAX_IMPORT_BYTES) {
    return Promise.resolve(
      err(domainError('invalid-import', 'Файл слишком большой (максимум 512 КБ).')),
    );
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve(err(domainError('invalid-import', 'Не удалось прочитать файл.')));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(ok(reader.result));
      } else {
        resolve(err(domainError('invalid-import', 'Не удалось прочитать файл как текст.')));
      }
    };
    reader.readAsText(file);
  });
}
