// One-off / re-runnable logo asset generator.
//
//   npm i --no-save sharp && node scripts/gen-logo.mjs
//
// Source: src/assets/logo-source.png  (transparent PNG, full "HelpCertify"
// lockup — icon on the left, wordmark on the right, may carry a soft glow).
// sharp is NOT a project dependency — install --no-save and re-run when the
// brand art changes.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SRC = 'src/assets/logo-source.png';
const OUT = 'src/assets';
const PUB = 'public';
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// --- find opaque bounding boxes ourselves (sharp's .trim() throws
// "bad extract area" on this glow-y art) ------------------------------------
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const ALPHA = 190; // "strongly opaque" — excludes the soft glow halo

function bbox(xLo = 0, xHi = W) {
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = xLo; x < xHi; x++) {
      if (data[(y * W + x) * C + 3] >= ALPHA) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
const pad = (b, p) => ({
  left: Math.max(0, b.left - p),
  top: Math.max(0, b.top - p),
  width: Math.min(W - Math.max(0, b.left - p), b.width + 2 * p),
  height: Math.min(H - Math.max(0, b.top - p), b.height + 2 * p),
});

const full = pad(bbox(), 8);
// Cut at the tassel-string gap (x≈652): the mark is shield + check + cap,
// without the dangling gold tassel, which is just noise at favicon size.
const icon = pad(bbox(0, 650), 6);
console.log('full lockup bbox', full, '\nicon bbox       ', icon);

// helper: crop to a rect, return a trimmed square-canvas buffer of the icon
async function iconSquare(px) {
  return sharp(SRC)
    .extract(icon)
    .resize({ width: px, height: px, fit: 'contain', background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// 1. Full lockup — header / footer / certificate screen (~2.5x display height).
const lockup = await sharp(SRC).extract(full).resize({ height: 120 }).toBuffer();
await sharp(lockup).png({ compressionLevel: 9 }).toFile(`${OUT}/logo-lockup.png`);
await sharp(lockup).webp({ quality: 90 }).toFile(`${OUT}/logo-lockup.webp`);

// 2. Icon-only mark — small UI. Square, transparent.
const mark = await iconSquare(256);
await sharp(mark).png({ compressionLevel: 9 }).toFile(`${OUT}/logo-mark.png`);
await sharp(mark).webp({ quality: 90 }).toFile(`${OUT}/logo-mark.webp`);

// 3. Favicon / PWA / Apple icons — icon centred in a transparent square.
for (const size of [32, 180, 192, 512]) {
  const p = Math.round(size * 0.08);
  const inner = size - 2 * p;
  const buf = await iconSquare(inner);
  const name = size === 32 ? 'favicon-32' : size === 180 ? 'apple-touch-icon' : `icon-${size}`;
  await sharp(buf)
    .extend({ top: p, bottom: p, left: p, right: p, background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(`${PUB}/${name}.png`);
}

// 3b. Social / Open Graph card — 1200x630, lockup on a soft brand wash.
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: { r: 240, g: 246, b: 255, alpha: 1 } },
})
  .composite([{ input: await sharp(SRC).extract(full).resize({ width: 760 }).toBuffer(), gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(`${PUB}/og-image.png`);

// 4. Certificate PDF — white-matte JPEG (jsPDF has no alpha blend; JPEG
//    keeps the inlined base64 in api/results.ts small).
const printJpeg = await sharp(SRC)
  .flatten({ background: '#ffffff' })
  .extract(full)
  .resize({ height: 120 })
  .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
  .toBuffer();
writeFileSync('scripts/_logo-print-base64.txt', printJpeg.toString('base64'));
console.log('done. pdf jpeg base64', Math.round(printJpeg.toString('base64').length / 1024), 'KB');
