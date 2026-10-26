#!/usr/bin/env node
/**
 * Generates the original ROOM FACTORY AR marker and runs the OFFICIAL
 * @8thwall/image-target-cli on it. Outputs live in public/marker/ and are
 * copied into dist by Vite. The JSON produced by the CLI is kept as-is; its
 * relative imagePath is resolved against the metadata URL at runtime.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'public', 'marker');
const NAME = 'room-factory-marker';
const WIDTH = 1200;
const HEIGHT = 1600;
const IMAGE_PATH = path.join(OUT_DIR, `${NAME}.png`);

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function markerSvg() {
  const rand = rng(0x5eed2026);
  const dark = '#252A2D';
  const graphite = '#161B1E';
  const amber = '#E7AB20';
  const teal = '#238B9B';
  const metal = '#CBD3D3';
  const light = '#F4E9C9';

  const traces = [];
  const pads = [];
  for (let i = 0; i < 54; i += 1) {
    const startX = 70 + rand() * (WIDTH - 140);
    const startY = 60 + rand() * (HEIGHT - 120);
    let x = startX;
    let y = startY;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const segments = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < segments; s += 1) {
      const axis = rand() > 0.5;
      const length = 30 + rand() * 190;
      if (axis) x += (rand() > 0.5 ? 1 : -1) * length;
      else y += (rand() > 0.5 ? 1 : -1) * length;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const color = rand() > 0.72 ? teal : rand() > 0.5 ? graphite : dark;
    const width = 3 + rand() * 10;
    traces.push(`<path d="${d}" stroke="${color}" stroke-width="${width.toFixed(1)}" fill="none" stroke-linecap="square"/>`);
    pads.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 + rand() * 8).toFixed(1)}" fill="${rand() > 0.6 ? metal : teal}" stroke="${graphite}" stroke-width="2"/>`);
  }

  const chips = [];
  for (let i = 0; i < 16; i += 1) {
    const w = 30 + rand() * 110;
    const h = 20 + rand() * 80;
    const x = 80 + rand() * (WIDTH - 220);
    const y = 700 + rand() * 760;
    const fill = rand() > 0.55 ? graphite : dark;
    chips.push(
      `<g transform="rotate(${(rand() * 10 - 5).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">` +
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${teal}" stroke-width="2"/>` +
        `<rect x="${(x + 6).toFixed(1)}" y="${(y + 6).toFixed(1)}" width="${Math.max(8, w - 12).toFixed(1)}" height="${Math.max(6, h - 12).toFixed(1)}" fill="none" stroke="${metal}" stroke-width="1" opacity="0.55"/>` +
        `</g>`,
    );
  }

  const dataCells = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (rand() > 0.52) {
        dataCells.push(
          `<rect x="${765 + col * 18}" y="${1090 + row * 18}" width="15" height="15" fill="${rand() > 0.5 ? graphite : teal}"/>`,
        );
      }
    }
  }

  const barcode = [];
  let bx = 790;
  for (let i = 0; i < 22; i += 1) {
    const w = 2 + Math.floor(rand() * 10);
    barcode.push(`<rect x="${bx}" y="1435" width="${w}" height="${80 + Math.floor(rand() * 34)}" fill="${graphite}"/>`);
    bx += w + 4 + Math.floor(rand() * 5);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${amber}"/>
      <stop offset="0.55" stop-color="#EFB62D"/>
      <stop offset="1" stop-color="#D89B13"/>
    </linearGradient>
    <pattern id="micro" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="4" r="1.1" fill="#000" opacity="0.16"/>
      <circle cx="14" cy="12" r="0.9" fill="#000" opacity="0.12"/>
    </pattern>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#micro)" opacity="0.55"/>

  <!-- off-centre dark PCB panel -->
  <path d="M 52 44 L 1020 44 L 1148 170 L 1148 1170 L 1040 1280 L 1040 1556 L 52 1556 Z" fill="${graphite}" stroke="#0C0F10" stroke-width="10"/>
  <path d="M 84 78 L 990 78 L 1112 204 L 1112 1142 L 1004 1250 L 1004 1520 L 84 1520 Z" fill="${dark}" stroke="#3B4347" stroke-width="3"/>
  <rect x="108" y="104" width="880" height="1392" fill="none" stroke="${amber}" stroke-width="2" opacity="0.55"/>

  <!-- asymmetric corner registration marks (three only) -->
  <g stroke="${amber}" stroke-width="6" fill="none">
    <path d="M 120 140 L 120 210 M 120 140 L 190 140"/>
    <circle cx="120" cy="140" r="14" stroke-width="4"/>
    <path d="M 1080 140 L 1010 140 M 1080 140 L 1080 210"/>
    <circle cx="1080" cy="140" r="14" stroke-width="4"/>
    <path d="M 120 1440 L 120 1370 M 120 1440 L 190 1440"/>
    <circle cx="120" cy="1440" r="14" stroke-width="4"/>
  </g>

  <!-- circuit field -->
  <g opacity="0.92">${traces.join('')}</g>
  <g>${pads.join('')}</g>

  <!-- unique top block -->
  <path d="M 180 230 L 720 230 L 780 290 L 780 470 L 180 470 Z" fill="${graphite}" stroke="${teal}" stroke-width="4"/>
  <text x="214" y="330" fill="${amber}" font-family="Arial Black, Arial, sans-serif" font-size="104" font-weight="900" letter-spacing="2">ROOM</text>
  <text x="214" y="432" fill="${metal}" font-family="Arial Black, Arial, sans-serif" font-size="104" font-weight="900" letter-spacing="2">FACTORY</text>
  <text x="790" y="286" fill="${teal}" font-family="Consolas, monospace" font-size="26" letter-spacing="8">RFA-01</text>

  <!-- central asymmetric identifier -->
  <g transform="translate(0 520)">
    <rect x="180" y="0" width="818" height="150" fill="${amber}"/>
    <text x="210" y="112" fill="${graphite}" font-family="Arial Black, Arial, sans-serif" font-size="108" font-weight="900" letter-spacing="5">MARKER</text>
    <text x="880" y="112" fill="${graphite}" font-family="Consolas, monospace" font-size="92" font-weight="700">01</text>
  </g>

  <!-- diagonal hazard strip, intentionally off-centre -->
  <g transform="translate(690 700) rotate(-18)">
    <rect x="0" y="0" width="390" height="42" fill="${amber}"/>
    <rect x="0" y="52" width="300" height="18" fill="${teal}"/>
    <rect x="0" y="88" width="390" height="8" fill="${metal}"/>
  </g>

  <!-- chip field -->
  <g>${chips.join('')}</g>

  <!-- data matrix (illustrative, not a QR code) -->
  <rect x="742" y="1066" width="206" height="206" fill="${light}" stroke="${graphite}" stroke-width="5"/>
  <g>${dataCells.join('')}</g>
  <text x="742" y="1306" fill="${metal}" font-family="Consolas, monospace" font-size="18" letter-spacing="3">RFA/01-2026</text>

  <!-- barcode + serial -->
  <g>${barcode.join('')}</g>
  <text x="120" y="1388" fill="${light}" font-family="Consolas, monospace" font-size="22" letter-spacing="3">ROOM FACTORY AR · IMAGE TARGET · 12 × 16 CM</text>
  <text x="120" y="1480" fill="${amber}" font-family="Consolas, monospace" font-size="18" letter-spacing="2">DO NOT MOVE AFTER BINDING</text>
  <text x="690" y="1480" fill="${metal}" font-family="Consolas, monospace" font-size="18" letter-spacing="2">RFA-MK-001</text>

  <!-- three big screws -->
  <g>
    <circle cx="960" cy="1388" r="38" fill="${metal}" stroke="${graphite}" stroke-width="7"/>
    <path d="M 936 1388 L 984 1388 M 960 1364 L 960 1412" stroke="${graphite}" stroke-width="7"/>
    <circle cx="960" cy="980" r="26" fill="${metal}" stroke="${graphite}" stroke-width="5"/>
    <path d="M 944 980 L 976 980" stroke="${graphite}" stroke-width="5"/>
    <circle cx="360" cy="1010" r="18" fill="${teal}" stroke="${graphite}" stroke-width="4"/>
  </g>

  <!-- top arrow -->
  <g transform="translate(600 20)">
    <path d="M 0 0 L 26 34 L -26 34 Z" fill="${teal}" stroke="${graphite}" stroke-width="3"/>
    <text x="46" y="26" fill="${graphite}" font-family="Consolas, monospace" font-size="20" letter-spacing="2">TOP</text>
  </g>
</svg>`;
}

function printHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ROOM FACTORY AR — карточка для печати</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 18mm 12mm; background: #f2f0e8; color: #171b1d; font-family: Arial, sans-serif; }
  .sheet { max-width: 190mm; margin: 0 auto; }
  h1 { margin: 0 0 4mm; font-size: 20pt; letter-spacing: 0.02em; }
  .warning { padding: 4mm 5mm; border-left: 4px solid #D75F46; background: #fff3ee; font-size: 10.5pt; line-height: 1.45; margin-bottom: 5mm; }
  .marker-wrap { width: 120mm; height: 160mm; margin: 14mm auto 0; border: 0.4mm dashed #999; position: relative; background: #fff; }
  .marker-wrap img { width: 120mm; height: 160mm; display: block; image-rendering: auto; }
  .top-arrow { position: absolute; top: -9mm; left: 50%; transform: translateX(-50%); font-size: 9pt; color: #333; white-space: nowrap; }
  .ruler { width: 100mm; height: 10mm; margin: 4mm auto 0; border: 0.3mm solid #333; display: flex; }
  .ruler span { flex: 1; border-right: 0.3mm solid #333; position: relative; }
  .ruler span:last-child { border-right: 0; }
  .ruler span::after { content: ""; position: absolute; left: 50%; bottom: 0; height: 4mm; border-left: 0.3mm solid #333; }
  .ruler-label { text-align: center; font-size: 9pt; margin-top: 1mm; }
  .meta { margin-top: 6mm; font-size: 10pt; line-height: 1.55; }
  .meta code { background: #e9e6dc; padding: 0.5mm 1.5mm; border-radius: 1mm; }
  .checklist { margin-top: 4mm; font-size: 10pt; line-height: 1.55; padding-left: 5mm; }
  @page { size: A4 portrait; margin: 10mm; }
  @media print {
    body { padding: 0; background: #fff; }
    .warning { background: #fff; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <h1>ROOM FACTORY AR · карточка-маркер</h1>
  <div class="warning">
    <strong>Печать только при 100% масштабе.</strong> Отключите «по размеру страницы» / «fit to page».
    После печати проверьте линейкой: изображение должно быть ровно <strong>120 × 160 мм</strong>.
    Не перемещайте карточку после привязки завода.
  </div>
  <div class="marker-wrap">
    <div class="top-arrow">▲ ВЕРХ · держите этой стороной вверх</div>
    <img src="room-factory-marker.png" alt="Маркер ROOM FACTORY AR" />
  </div>
  <div class="ruler" aria-hidden="true">
    ${Array.from({ length: 10 }, () => '<span></span>').join('')}
  </div>
  <div class="ruler-label">контрольная ширина 100 мм</div>
  <div class="meta">
    Физический размер: <code>120 × 160 мм</code> (портрет).<br />
    Уникальный image target: <code>room-factory-marker</code>.<br />
    Печать: обычная бумага, матовая; избегайте бликов и ламинации.<br />
    Свет: равномерное освещение, без сильных теней на карточке.
  </div>
  <ol class="checklist">
    <li>Положите карточку на стол рядом с местом завода.</li>
    <li>Откройте игру, нажмите «Привязать карточкой».</li>
    <li>Наведите камеру и держите её неподвижно 1–2 секунды.</li>
    <li>Не перемещайте карточку после успешной привязки.</li>
  </ol>
  <p class="no-print">Печать: Ctrl/Cmd + P. Масштаб страницы — 100%, поля — стандартные.</p>
</div>
</body>
</html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const svg = markerSvg();
  await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toFile(IMAGE_PATH);
  await writeFile(path.join(OUT_DIR, `${NAME}-print.html`), printHtml(), 'utf8');

  const cli = path.join(ROOT, 'node_modules', '@8thwall', 'image-target-cli', 'src', 'index.js');
  if (!existsSync(cli)) {
    throw new Error('Install @8thwall/image-target-cli before generating the marker.');
  }

  const answers = [
    IMAGE_PATH,
    '', // default image type: flat
    '', // default crop
    OUT_DIR,
    NAME,
  ].join('\n');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OVERWRITE_FILES: 'true' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`image-target-cli exited ${code}\n${stdout}\n${stderr}`));
        return;
      }
      resolve();
    });
    child.stdin.write(`${answers}\n`);
    child.stdin.end();
  });

  const jsonPath = path.join(OUT_DIR, `${NAME}.json`);
  const json = JSON.parse(await readFile(jsonPath, 'utf8'));
  if (!json.imagePath || !json.resources?.luminanceImage) {
    throw new Error('image-target-cli output is missing imagePath/resources.');
  }
  // The CLI writes imagePath as a URL ('image-targets/...'), not a path relative
  // to the output folder. Rewrite it to a filename relative to the metadata URL
  // so any GitHub Pages subpath works without a special dist folder.
  json.imagePath = json.resources.luminanceImage;
  await writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  const luminancePath = path.join(OUT_DIR, json.resources.luminanceImage);
  if (!existsSync(luminancePath)) {
    throw new Error(`Missing generated luminance image: ${luminancePath}`);
  }
  const thumbnailPath = path.join(OUT_DIR, json.resources.thumbnailImage);
  if (existsSync(thumbnailPath)) {
    await copyFile(thumbnailPath, path.join(OUT_DIR, `${NAME}_thumbnail.png`));
  }
  console.log(`Marker written to ${OUT_DIR}`);
  console.log(`  metadata: ${NAME}.json`);
  console.log(`  image:    ${json.imagePath}`);
  console.log(`  print:    ${NAME}-print.html`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
