#!/usr/bin/env node
/**
 * Verifies the production build as it will be served from a GitHub Pages
 * subpath. Catches missing XR chunks, marker companions and absolute /src links.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.VITE_BASE_PATH || '/room-factory-ar/').replace(/\/?$/, '/');
const failures = [];

function fail(message) {
  failures.push(message);
}

function checkFile(relative, label = relative) {
  const full = path.join(DIST, relative);
  if (!existsSync(full)) {
    fail(`missing ${label} (${relative})`);
    return false;
  }
  return true;
}

function checkHttpUrl(url, label) {
  if (url.startsWith('/src/')) {
    fail(`absolute /src/ reference in built HTML: ${label} (${url})`);
  }
  if (url.startsWith('/') && !url.startsWith(BASE)) {
    fail(`absolute path outside base ${BASE}: ${label} (${url})`);
  }
}

function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ is missing — run npm run build.');
  }
  const index = readFileSync(path.join(DIST, 'index.html'), 'utf8');

  checkFile('index.html');
  checkFile('external/xr/xr.js', 'XR runtime');
  checkFile('external/xr/xr-slam.js', 'XR SLAM chunk');
  checkFile('external/xr/resources/powered-by.svg', 'XR attribution resource');
  checkFile('external/xr/LICENSE', 'XR engine license');
  checkFile('marker/room-factory-marker.json', 'marker metadata');
  checkFile('marker/room-factory-marker.png', 'marker print image');
  checkFile('marker/room-factory-marker_luminance.png', 'marker luminance image');
  checkFile('marker/room-factory-marker-print.html', 'marker print page');
  checkFile('icon.svg', 'favicon');

  const markerJsonPath = path.join(DIST, 'marker', 'room-factory-marker.json');
  if (existsSync(markerJsonPath)) {
    const marker = JSON.parse(readFileSync(markerJsonPath, 'utf8'));
    if (marker.name !== 'room-factory-marker') fail('marker metadata has an unexpected name');
    if (marker.type !== 'PLANAR') fail(`marker type is ${marker.type}, expected PLANAR`);
    if (!marker.properties || marker.properties.width < 480) {
      fail('marker metadata properties are missing/too small');
    }
    if (!marker.imagePath || /^https?:|^\//.test(marker.imagePath)) {
      fail('marker imagePath must be relative to the metadata URL');
    } else {
      checkFile(path.join('marker', marker.imagePath), 'marker imagePath target');
    }
    for (const companion of Object.values(marker.resources || {})) {
      if (typeof companion === 'string') checkFile(path.join('marker', companion), `marker ${companion}`);
    }
  }

  if (!/src="[^"]*assets\/[^"]+\.js"/.test(index)) fail('built index.html has no hashed JS bundle');
  if (!/href="[^"]*assets\/[^"]+\.css"/.test(index)) fail('built index.html has no hashed CSS bundle');

  const urls = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  for (const url of urls) {
    if (!url || url.startsWith('data:') || url.startsWith('https://')) continue;
    checkHttpUrl(url, 'index.html');
    if (url.startsWith(BASE)) {
      const relative = url.slice(BASE.length).split('?')[0];
      if (relative && !relative.startsWith('http')) checkFile(relative, `index asset ${relative}`);
    }
  }

  if (index.includes('data-preload-chunks') || index.includes('external/xr/xr.js')) {
    // The runtime is intentionally injected by src/ar/xr-loader.ts, not hardcoded
    // in HTML; seeing it here is not fatal but warns about duplicate loading.
    console.warn('note: index.html mentions the XR runtime; the loader should own it.');
  }

  const assets = existsSync(path.join(DIST, 'assets')) ? readdirSync(path.join(DIST, 'assets')) : [];
  if (!assets.some((file) => file.endsWith('.js'))) fail('dist/assets has no JS bundle');
  if (!assets.some((file) => file.endsWith('.css'))) fail('dist/assets has no CSS bundle');

  const printPath = path.join(DIST, 'marker', 'room-factory-marker-print.html');
  if (existsSync(printPath)) {
    const print = readFileSync(printPath, 'utf8');
    if (!print.includes('room-factory-marker.png')) fail('print page does not reference marker image');
    if (!print.includes('120mm') || !print.includes('160mm')) {
      fail('print page is missing physical 120×160 mm dimensions');
    }
    if (!print.includes('100%')) fail('print page does not warn about 100% scale');
  }

  if (failures.length > 0) {
    console.error('verify-dist failed:');
    for (const item of failures) console.error(`  - ${item}`);
    process.exitCode = 1;
    return;
  }
  console.log(`verify-dist OK · base ${BASE} · ${assets.length} assets · marker companions present`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
