#!/usr/bin/env node
/**
 * generate-icons.mjs
 * Pure Node.js icon generator — no external dependencies required.
 *
 * Produces:
 *   public/icons/icon-192.png          (192×192, standard)
 *   public/icons/icon-512.png          (512×512, standard)
 *   public/icons/icon-maskable-192.png (192×192, maskable — full-bleed bg)
 *   public/icons/icon-maskable-512.png (512×512, maskable — full-bleed bg)
 *   public/icons/apple-touch-icon.png  (180×180)
 *   public/favicon.ico                 (32×32 PNG-embedded ICO)
 *   public/icons/favicon.svg           (SVG source, referenced in <head>)
 *
 * Run: node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── CRC-32 (required by PNG format) ────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── PNG helpers ─────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Create a solid-colour square PNG at `size × size` pixels. */
function solidPNG(size, r, g, b) {
  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0; // compression / filter / interlace

  // One scanline (filter=None + RGB*size), then copy it `size` times
  const row = Buffer.allocUnsafe(1 + size * 3);
  row[0] = 0; // filter None
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── ICO wrapper (PNG-in-ICO, supported by all modern browsers) ──────────────

function wrapInICO(pngBuf, size) {
  const header = Buffer.allocUnsafe(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const dir = Buffer.allocUnsafe(16);
  dir[0] = size & 0xff; // width  (0 means 256)
  dir[1] = size & 0xff; // height
  dir[2] = 0;           // colour count (0 = no palette)
  dir[3] = 0;           // reserved
  dir.writeUInt16LE(1,  4);             // planes
  dir.writeUInt16LE(32, 6);            // bit count
  dir.writeUInt32LE(pngBuf.length, 8); // image size
  dir.writeUInt32LE(22, 12);           // offset to image data (6 + 16)

  return Buffer.concat([header, dir, pngBuf]);
}

// ─── Design ──────────────────────────────────────────────────────────────────

// Brand colour: jade #2d7d6a
const [R, G, B] = [0x2d, 0x7d, 0x6a];

// ─── SVG source (committed for future edits / re-export) ─────────────────────

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="80" fill="#2d7d6a"/>
  <!-- Stylised "M" (Mandarin) built from simple paths — no font required -->
  <g fill="white" transform="translate(256,256)">
    <!-- Left leg -->
    <rect x="-110" y="-120" width="40" height="240" rx="8"/>
    <!-- Right leg -->
    <rect x="70"  y="-120" width="40" height="240" rx="8"/>
    <!-- Centre V -->
    <polygon points="-90,-120 -50,-20 -10,-120" />
    <polygon points="10,-120  50,-20  90,-120" />
    <!-- Bridge between V tips -->
    <rect x="-60" y="-30" width="120" height="34" rx="8"/>
  </g>
</svg>`;

const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Full-bleed background (no rounded corners — OS applies the mask) -->
  <rect width="512" height="512" fill="#2d7d6a"/>
  <!-- Same "M" mark, scaled down ~10% to respect the 80% safe zone -->
  <g fill="white" transform="translate(256,256) scale(0.9)">
    <rect x="-110" y="-120" width="40" height="240" rx="8"/>
    <rect x="70"   y="-120" width="40" height="240" rx="8"/>
    <polygon points="-90,-120 -50,-20 -10,-120" />
    <polygon points="10,-120  50,-20  90,-120" />
    <rect x="-60" y="-30" width="120" height="34" rx="8"/>
  </g>
</svg>`;

const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="5" fill="#2d7d6a"/>
  <g fill="white" transform="translate(16,16) scale(0.055)">
    <rect x="-110" y="-120" width="40" height="240" rx="8"/>
    <rect x="70"   y="-120" width="40" height="240" rx="8"/>
    <polygon points="-90,-120 -50,-20 -10,-120" />
    <polygon points="10,-120  50,-20  90,-120" />
    <rect x="-60" y="-30" width="120" height="34" rx="8"/>
  </g>
</svg>`;

// ─── Write files ─────────────────────────────────────────────────────────────

const iconsDir = join(ROOT, 'public', 'icons');
const publicDir = join(ROOT, 'public');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const icons = [
  { name: 'icon-192.png',          size: 192 },
  { name: 'icon-512.png',          size: 512 },
  { name: 'icon-maskable-192.png', size: 192 },
  { name: 'icon-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png',  size: 180 },
];

for (const { name, size } of icons) {
  const png = solidPNG(size, R, G, B);
  writeFileSync(join(iconsDir, name), png);
  console.log(`  ✓ public/icons/${name} (${size}×${size})`);
}

// favicon.ico — 32×32 PNG wrapped in ICO container
const favicon32 = solidPNG(32, R, G, B);
writeFileSync(join(publicDir, 'favicon.ico'), wrapInICO(favicon32, 32));
console.log('  ✓ public/favicon.ico (32×32)');

// SVG sources
writeFileSync(join(iconsDir, 'icon.svg'),          svgIcon);
writeFileSync(join(iconsDir, 'icon-maskable.svg'), svgMaskable);
writeFileSync(join(iconsDir, 'favicon.svg'),       svgFavicon);
console.log('  ✓ public/icons/*.svg (source SVGs)');

console.log('\nAll icons generated. Solid-colour placeholder (#2d7d6a jade).');
console.log('SVG sources in public/icons/ can be edited and re-run to update PNGs.');
