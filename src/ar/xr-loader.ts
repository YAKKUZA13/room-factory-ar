import { APP_BASE, MARKER_METADATA_URL, XR_RUNTIME_URL } from '../config';
import type { XR8Api } from './xr8-types';

export interface ImageTargetMetadata {
  name: string;
  type: string;
  imagePath: string;
  properties: Record<string, unknown>;
  metadata?: unknown;
  resources?: Record<string, string>;
  created?: number;
  updated?: number;
}

let runtimePromise: Promise<XR8Api> | null = null;

/**
 * Loads the self-hosted 8th Wall runtime with a hard timeout. Appends the script
 * exactly once; if another copy is already present we only wait for `xrloaded`.
 */
export function loadXrRuntime(timeoutMs = 20_000): Promise<XR8Api> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('XR runtime requires a browser'));
  }
  if (window.XR8) return Promise.resolve(window.XR8);
  if (runtimePromise) return runtimePromise;

  runtimePromise = new Promise<XR8Api>((resolve, reject) => {
    let settled = false;
    let interval = 0;
    let timer = 0;

    const cleanup = (): void => {
      window.removeEventListener('xrloaded', onLoaded);
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      runtimePromise = null;
      document.getElementById('room-factory-xr-runtime')?.remove();
      reject(error);
    };
    const onLoaded = (): void => {
      if (settled) return;
      if (!window.XR8) {
        fail(new Error('xrloaded fired but window.XR8 is missing'));
        return;
      }
      settled = true;
      cleanup();
      resolve(window.XR8);
    };

    window.addEventListener('xrloaded', onLoaded, { once: true });
    interval = window.setInterval(() => {
      if (window.XR8) onLoaded();
    }, 100);
    timer = window.setTimeout(() => {
      fail(
        new Error(
          'Движок AR не загрузился за 20 секунд. Проверьте соединение и повторите попытку.',
        ),
      );
    }, timeoutMs);

    const existing = document.getElementById('room-factory-xr-runtime') as
      | HTMLScriptElement
      | null;
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'room-factory-xr-runtime';
      script.src = XR_RUNTIME_URL;
      script.async = true;
      script.dataset.preloadChunks = 'slam';
      script.addEventListener('error', () => {
        fail(
          new Error(
            'Не удалось загрузить external/xr/xr.js. Проверьте публикацию runtime на GitHub Pages.',
          ),
        );
      });
      document.head.appendChild(script);
    }
  });

  return runtimePromise;
}

export function resetXrRuntimeLoaderForTests(): void {
  runtimePromise = null;
}

function resolveImagePath(rawPath: string, metadataUrl: string): string {
  if (/^(https?:|data:|blob:)/i.test(rawPath)) return rawPath;
  if (rawPath.startsWith('/')) {
    const origin = window.location.origin;
    if (APP_BASE !== '/' && rawPath.startsWith(APP_BASE)) {
      return new URL(rawPath, origin).href;
    }
    // Absolute paths are a common GitHub Pages mistake: put them under base.
    return new URL(rawPath.replace(/^\/+/, ''), new URL(APP_BASE, origin)).href;
  }
  return new URL(rawPath, new URL('.', metadataUrl)).href;
}

export async function loadMarkerMetadata(
  metadataUrl: string = MARKER_METADATA_URL,
): Promise<ImageTargetMetadata> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(metadataUrl, { cache: 'no-cache', signal: controller.signal });
  } catch (error) {
    throw new Error(
      `Не удалось загрузить image target metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить image target metadata (${response.status}). Проверьте public/marker/*.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error('Image target metadata содержит некорректный JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Image target metadata пуста.');
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
    throw new Error('Image target metadata: отсутствует name.');
  }
  if (
    candidate.type !== 'PLANAR' &&
    candidate.type !== 'CYLINDER' &&
    candidate.type !== 'CONICAL'
  ) {
    throw new Error(
      `Image target metadata: неизвестный type ${String(candidate.type)}. Используйте JSON из официального CLI.`,
    );
  }
  if (typeof candidate.imagePath !== 'string' || candidate.imagePath.length === 0) {
    throw new Error('Image target metadata: отсутствует imagePath.');
  }
  if (!candidate.properties || typeof candidate.properties !== 'object') {
    throw new Error('Image target metadata: отсутствует properties.');
  }

  return {
    name: candidate.name,
    type: candidate.type,
    imagePath: resolveImagePath(candidate.imagePath, metadataUrl),
    properties: candidate.properties as Record<string, unknown>,
    metadata: candidate.metadata,
    resources:
      candidate.resources && typeof candidate.resources === 'object'
        ? (candidate.resources as Record<string, string>)
        : undefined,
    created: typeof candidate.created === 'number' ? candidate.created : undefined,
    updated: typeof candidate.updated === 'number' ? candidate.updated : undefined,
  };
}
