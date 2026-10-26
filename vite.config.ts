import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const xrDist = resolve(projectRoot, 'node_modules/@8thwall/engine-binary/dist');

function normalizeBase(value: string): string {
  let base = value.trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.tflite': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

/**
 * Dev-only static server for the local 8th Wall runtime. Production copies the
 * entire dist folder in scripts/copy-xr-assets.mjs, matching GitHub Pages.
 */
function xrDevAssets(): Plugin {
  return {
    name: 'room-factory-xr-dev-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/external/xr', (req, res, next) => {
        const rawPath = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const filePath = resolve(xrDist, `.${rawPath}`);
        if (!filePath.startsWith(xrDist + sep) && filePath !== xrDist) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages project site by default; override with VITE_BASE_PATH.
  base: normalizeBase(process.env.VITE_BASE_PATH ?? (mode === 'production' ? '/room-factory-ar/' : '/')),
  plugins: [xrDevAssets()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    reporters: 'default',
  },
}));
