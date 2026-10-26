#!/usr/bin/env node
/** Copies the complete 8th Wall engine-binary dist into dist/external/xr. */
import { cp, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'node_modules', '@8thwall', 'engine-binary', 'dist');
const DEST = path.join(ROOT, 'dist', 'external', 'xr');

async function main() {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('dist/index.html is missing — run vite build first.');
  }
  if (!existsSync(SRC)) {
    throw new Error('node_modules/@8thwall/engine-binary/dist is missing — run npm ci.');
  }
  await mkdir(DEST, { recursive: true });
  await cp(SRC, DEST, { recursive: true, force: true });

  const required = ['xr.js', 'xr-slam.js', 'resources/powered-by.svg', 'LICENSE'];
  for (const file of required) {
    const target = path.join(DEST, file);
    if (!existsSync(target)) {
      throw new Error(`XR runtime copy is incomplete: ${target}`);
    }
    const info = await stat(target);
    console.log(`  ${file.padEnd(30)} ${(info.size / 1024).toFixed(1)} KiB`);
  }
  console.log(`Copied 8th Wall runtime to ${path.relative(ROOT, DEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
