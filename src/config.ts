import { DEFAULT_CELL_SIZE_METERS } from './core/constants';

export const APP_VERSION = '1.0.0';
export const COMMIT_HASH = (import.meta.env.VITE_COMMIT_HASH as string | undefined) ?? 'local';
export const APP_BASE = import.meta.env.BASE_URL;

const params = new URLSearchParams(window.location.search);

export const IS_DEBUG = params.get('debug') === '1';
export const IS_MOCK_AR =
  params.get('mockAR') === '1' && (import.meta.env.DEV || params.get('debug') === '1');
export const FORCED_MODE = params.get('mode');
export const MOCK_ORIGIN_OFFSET: [number, number, number] = (() => {
  const raw = params.get('mockOrigin');
  if (!raw) return [0, 0, 0];
  const parts = raw.split(',').map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return [0, 0, 0];
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
})();

export function assetUrl(path: string): string {
  return `${APP_BASE}${path.replace(/^\/+/, '')}`;
}

export const XR_RUNTIME_URL = assetUrl('external/xr/xr.js');
export const MARKER_METADATA_URL = assetUrl('marker/room-factory-marker.json');
export const MARKER_PRINT_URL = assetUrl('marker/room-factory-marker-print.html');
export const MARKER_IMAGE_URL = assetUrl('marker/room-factory-marker.png');
export const MARKER_TARGET_NAME = 'room-factory-marker';

export const DEFAULT_SCALE = DEFAULT_CELL_SIZE_METERS * 10;
export const APP_ORIGIN = window.location.origin;

export function navigateTo3d(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', '3d');
  window.location.replace(url.toString());
}

export function navigateToHome(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.location.replace(url.toString());
}
