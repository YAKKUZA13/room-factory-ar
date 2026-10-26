import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMarkerMetadata } from '../../src/ar/xr-loader';

vi.mock('../../src/config', () => ({
  APP_BASE: '/room-factory-ar/',
  MARKER_METADATA_URL: '/room-factory-ar/marker/room-factory-marker.json',
  XR_RUNTIME_URL: '/room-factory-ar/external/xr/xr.js',
}));

describe('marker image URLs', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      location: {
        href: 'https://192.168.0.13:5443/room-factory-ar/',
        origin: 'https://192.168.0.13:5443',
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function serveMetadata(imagePath = 'room-factory-marker_luminance.png') {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'room-factory-marker',
      type: 'PLANAR',
      imagePath,
      properties: { width: 1200, height: 1600 },
    }))));
  }

  it('loads the default root-relative metadata URL on the phone HTTPS origin', async () => {
    serveMetadata();
    const metadata = await loadMarkerMetadata();
    expect(metadata.imagePath).toBe(
      'https://192.168.0.13:5443/room-factory-ar/marker/room-factory-marker_luminance.png',
    );
  });

  it('resolves document-relative metadata against the current page', async () => {
    serveMetadata();
    const metadata = await loadMarkerMetadata('marker/room-factory-marker.json');
    expect(metadata.imagePath).toBe(
      'https://192.168.0.13:5443/room-factory-ar/marker/room-factory-marker_luminance.png',
    );
  });

  it('resolves an image relative to metadata hosted on another origin', async () => {
    serveMetadata();
    const metadata = await loadMarkerMetadata('https://assets.example.test/targets/marker.json');
    expect(metadata.imagePath).toBe(
      'https://assets.example.test/targets/room-factory-marker_luminance.png',
    );
  });

  it.each([
    ['/marker/image.png', 'https://192.168.0.13:5443/room-factory-ar/marker/image.png'],
    ['/room-factory-ar/marker/image.png', 'https://192.168.0.13:5443/room-factory-ar/marker/image.png'],
    ['https://assets.example.test/image.png', 'https://assets.example.test/image.png'],
  ])('preserves the existing handling of %s', async (imagePath, expected) => {
    serveMetadata(imagePath);
    expect((await loadMarkerMetadata()).imagePath).toBe(expected);
  });
});
