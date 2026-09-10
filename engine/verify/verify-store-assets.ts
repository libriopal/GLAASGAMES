// engine/verify/verify-store-assets.ts — listing art is held to the same
// contrast floor as the app itself.
//
// V1  every store asset decodes and matches its declared dimensions
// V2  the headline text CLEARS THE APCA FLOOR against its own background
// V3  the asset is not uniformly dark — it has a real tonal range
// V4  the floor can fail                                (NEGATIVE CONTROL)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: A GENERATED ASSET FAILED, AND NOTHING WOULD HAVE CAUGHT IT.
//
// The first store graphic was produced through the Canva MCP. It came back
// correctly sized, free of the casino imagery the IARC declaration forbids, and
// using pip faces rather than numerals — three things that mattered and three
// things it got right.
//
// Then it was measured. Its title text sampled at rgb(76,105,127) on a black
// ground, which is APCA Lc -20.5. This project's own floors are |Lc| >= 90 for
// body text and >= 75 for large UI, and the shipped app's ink on its ground is
// -95.0. The listing art was roughly four and a half times below the standard
// the application it advertises is held to — and a Play Store thumbnail is
// rendered small, which is where low contrast does its worst work.
//
// `verify-theme` gates the APP's palette and nothing gated the STORE's. A
// product can be accessible and still be advertised by an image nobody can read.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { LC_BODY_TEXT, LC_LARGE_UI, apcaLc } from '../../web/theme.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };

interface Png { readonly w: number; readonly h: number; readonly px: Uint8Array }

/**
 * A minimal PNG reader — 8-bit truecolour only, which is what an exported store
 * asset is.
 *
 * Written inline rather than pulled in as a dependency: this oracle exists to
 * gate three or four images, and a build gate that drags a decoder into the
 * dependency tree costs more than it protects.
 */
function readPng(path: string): Png {
  const d = readFileSync(path);
  let pos = 8;
  let w = 0;
  let h = 0;
  let colourType = -1;
  const idat: Buffer[] = [];
  while (pos < d.length) {
    const len = d.readUInt32BE(pos);
    const type = d.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = d.readUInt32BE(pos + 8);
      h = d.readUInt32BE(pos + 12);
      colourType = d[pos + 17]!;
    } else if (type === 'IDAT') {
      idat.push(d.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }
  if (colourType !== 2) throw new Error(`readPng: colour type ${colourType}, expected 2 (truecolour)`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 3;
  const stride = w * bpp;
  const px = new Uint8Array(w * h * bpp);
  let prev = new Uint8Array(stride);
  let i = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[i]!;
    i += 1;
    const line = new Uint8Array(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      if (filter === 1) line[x] = (line[x]! + a) & 255;
      else if (filter === 2) line[x] = (line[x]! + b) & 255;
      else if (filter === 3) line[x] = (line[x]! + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    px.set(line, y * stride);
    prev = line;
  }
  return { w, h, px };
}

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The background and foreground of a region, as percentiles rather than
 * extremes.
 *
 * A single darkest and single brightest pixel would be picked out by one stray
 * antialiased edge. The 5th and 98th percentiles describe the ground the text
 * sits on and the ink it is drawn in.
 */
function groundAndInk(p: Png, x0: number, y0: number, x1: number, y1: number): {
  ground: { r: number; g: number; b: number };
  ink: { r: number; g: number; b: number };
} {
  const px: { r: number; g: number; b: number }[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * p.w + x) * 3;
      px.push({ r: p.px[o]!, g: p.px[o + 1]!, b: p.px[o + 2]! });
    }
  }
  px.sort((a, b) => lum(a.r, a.g, a.b) - lum(b.r, b.g, b.b));
  return {
    ground: px[Math.floor(px.length * 0.05)]!,
    ink: px[Math.max(0, px.length - 1 - Math.floor(px.length * 0.02))]!,
  };
}

/** Store assets, with the region their headline occupies. */
const ASSETS: readonly {
  readonly path: string;
  readonly w: number;
  readonly h: number;
  /** Headline region as fractions of the canvas. */
  readonly headline: readonly [number, number, number, number];
}[] = [
  // v1 was REJECTED by V2 below at |Lc| 20.5 and is kept out of the shipped set
  // rather than deleted, so the rejection stays reproducible.
  { path: '../../design/store/feature-graphic.png', w: 1024, h: 500, headline: [0.2, 0.08, 0.8, 0.22] },
];

for (const a of ASSETS) {
  let png: Png;
  try {
    png = readPng(fileURLToPath(new URL(a.path, import.meta.url)));
  } catch (e) {
    ok(false, `V1: ${a.path} could not be decoded — ${(e as Error).message}`);
    continue;
  }

  // V1 — the Play Store rejects a feature graphic that is not exactly 1024x500.
  ok(png.w === a.w && png.h === a.h,
    `V1: ${a.path} is ${png.w}x${png.h}, declared ${a.w}x${a.h}. The Play Store rejects a feature ` +
      'graphic that is not exactly its stated size.');

  const [fx0, fy0, fx1, fy1] = a.headline;
  const { ground, ink } = groundAndInk(
    png,
    Math.floor(fx0 * png.w), Math.floor(fy0 * png.h),
    Math.floor(fx1 * png.w), Math.floor(fy1 * png.h),
  );
  const lc = Math.abs(apcaLc(ink, ground));

  // V2 — a headline is large text, so the large-UI floor applies rather than the
  // body floor. It is still a floor.
  ok(lc >= LC_LARGE_UI,
    `V2: the headline in ${a.path} measures APCA |Lc| ${lc.toFixed(1)}, below the ${LC_LARGE_UI} ` +
      `floor for large UI text (body text is ${LC_BODY_TEXT}). Sampled ink rgb(${ink.r},${ink.g},` +
      `${ink.b}) on ground rgb(${ground.r},${ground.g},${ground.b}). The shipped app's own ink on ` +
      'its ground is 95.0 — listing art must not be less legible than the product it advertises, ' +
      'and a store thumbnail is rendered small.');

  // V3 — an asset that is uniformly dark reads as a black rectangle at thumbnail
  // size regardless of what it technically contains.
  let lo = 255;
  let hi = 0;
  for (let o = 0; o < png.px.length; o += 3) {
    const l = lum(png.px[o]!, png.px[o + 1]!, png.px[o + 2]!);
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  ok(hi - lo >= 60,
    `V3: ${a.path} spans only ${(hi - lo).toFixed(0)} levels of luminance. An asset with no tonal ` +
      'range is a dark rectangle in a store listing.');

  console.log(`  ${a.path.replace('../../', '')}: ${png.w}x${png.h}, headline |Lc| ${lc.toFixed(1)} ` +
    `(floor ${LC_LARGE_UI}), luminance range ${(hi - lo).toFixed(0)}`);
}

// ── V4: the floor can fail ─────────────────────────────────────────────────
{
  const faint = Math.abs(apcaLc({ r: 76, g: 105, b: 127 }, { r: 0, g: 0, b: 0 }));
  ok(faint < LC_LARGE_UI,
    `V4 NEGATIVE CONTROL FAILED: rgb(76,105,127) on black measures ${faint.toFixed(1)} and would ` +
      'PASS the floor. That is the exact colour pairing the first generated store graphic used, ' +
      'measured at 20.5 — if this check now accepts it, the floor has been moved.');
  const strong = Math.abs(apcaLc({ r: 233, g: 238, b: 244 }, { r: 8, g: 12, b: 18 }));
  ok(strong >= LC_LARGE_UI,
    `V4 NEGATIVE CONTROL FAILED: the app's own ink on its own ground measures ${strong.toFixed(1)} ` +
      'and would FAIL — the check rejects everything and is therefore worthless');
  console.log(`  V4 control: the rejected pairing measures ${faint.toFixed(1)} (fails), the app's ` +
    `shipped ink measures ${strong.toFixed(1)} (passes)`);
}

if (failures.length > 0) {
  console.error(`verify-store-assets: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-store-assets: V1-V4 pass. Listing art clears the same contrast floor as the app.');
