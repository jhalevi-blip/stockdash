// One-off generator for PWA app icons.
//
// Extracts the StockDashes logo MARK (three ascending bars + trend arrow, no
// wordmark) from components/Logo.jsx, centers it on a #0d1117 background, and
// rasterizes three PNGs into public/:
//   - icon-192.png          (192x192, ~standard margin)
//   - icon-512.png          (512x512, ~standard margin)
//   - icon-maskable-512.png  (512x512, ~20% safe-zone padding for maskable)
//
// Run:  node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const BG   = '#0d1117';
const GOLD = '#c49a1a';

// Logo mark copied verbatim from components/Logo.jsx (viewBox 0 0 20 20).
// Bounding box of the art is ~x[1,19] y[0.5,20] → center ≈ (10, 10.25).
const MARK = `
  <rect x="1"  y="14" width="4" height="6"  rx="0.5" fill="${GOLD}" />
  <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="${GOLD}" />
  <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="${GOLD}" />
  <path d="M2 12 L10 6 L17.5 0.5" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" fill="none" />
  <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
`;

// Mark bounding box in the 20x20 source coordinate system.
const BB = { minX: 1, minY: 0.5, w: 18, h: 19.5 };

// Build a full-canvas SVG: solid dark background + the mark scaled to occupy
// `fill` fraction of the canvas, centered.
function buildSvg(size, fill) {
  const scale = (fill * size) / Math.max(BB.w, BB.h);
  const scaledW = BB.w * scale;
  const scaledH = BB.h * scale;
  const tx = (size - scaledW) / 2 - BB.minX * scale;
  const ty = (size - scaledH) / 2 - BB.minY * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}" />
  <g transform="translate(${tx} ${ty}) scale(${scale})">${MARK}</g>
</svg>`;
}

async function render(name, size, fill) {
  const svg = buildSvg(size, fill);
  const out = join(PUBLIC, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`✓ ${name} — ${meta.width}x${meta.height}`);
}

// Standard icons fill ~70% (comfortable margin on the dark field).
// Maskable fills ~60%, i.e. ~20% padding per side so the art survives the
// platform's circular/squircle mask crop.
await render('icon-192.png',          192, 0.70);
await render('icon-512.png',          512, 0.70);
await render('icon-maskable-512.png', 512, 0.60);
console.log('Done.');
