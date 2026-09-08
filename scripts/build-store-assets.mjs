// Renders the Play Store listing graphics at their exact required pixel sizes.
// Chromium is already here for the browser tests, so it doubles as the
// rasteriser — no image library, no fonts to ship, and what you see is what the
// browser draws.
import { chromium } from 'playwright';

const INK = '#05050a';
const CYAN = '#7bdfff';
const VIOLET = '#f0c8ff';
const GREEN = '#9dff9d';

/** The tesseract: outer cube, inner cube, and the four edges joining them —
 *  the same mark as the launcher icon, so the store and the home screen agree. */
const tesseract = (scale, stroke) => `
  <g transform="scale(${scale})" fill="none" stroke-linecap="round">
    <path d="M30,34 L64,34 L64,68 L30,68 Z" stroke="${CYAN}"   stroke-width="${stroke}"/>
    <path d="M44,48 L78,48 L78,82 L44,82 Z" stroke="${VIOLET}" stroke-width="${stroke}"/>
    <path d="M30,34 L44,48 M64,34 L78,48 M64,68 L78,82 M30,68 L44,82"
          stroke="${GREEN}" stroke-width="${stroke * 0.8}"/>
  </g>`;

/** A field of w-coloured motes, seeded so the graphic is reproducible. */
function motes(count, width, height, seed) {
  let s = seed | 0;
  const rand = () => { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return Math.abs(s); };
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const x = rand() % width;
    const y = rand() % height;
    const r = 1 + (rand() % 30) / 10;
    const hue = 190 + (rand() % 130);
    const a = 0.15 + (rand() % 55) / 100;
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${hue} 90% 70%)" opacity="${a.toFixed(2)}"/>`;
  }
  return out;
}

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#141433"/>
      <stop offset="100%" stop-color="${INK}"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${motes(120, 512, 512, 0x4d17)}
  <g transform="translate(28,28)">${tesseract(4.2, 5)}</g>
</svg>`;

const feature = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="g" cx="22%" cy="50%" r="80%">
      <stop offset="0%" stop-color="#151538"/>
      <stop offset="100%" stop-color="${INK}"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#g)"/>
  ${motes(260, 1024, 500, 0x9a3f)}
  <g transform="translate(52,132) scale(1.02)">${tesseract(2.35, 4.2)}</g>
  <text x="330" y="214" fill="#e8e8f0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="62" letter-spacing="7">GLAAS 4D</text>
  <text x="332" y="262" fill="${CYAN}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="22" letter-spacing="1.9">A NEW WORLD EVERY DAY, IN FOUR DIMENSIONS</text>
  <text x="332" y="308" fill="#7a7a92" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="15" letter-spacing="0.4">every run verifiable · fully offline · no ads, no timers, no streaks</text>
</svg>`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

for (const [name, svg, width, height] of [
  ['store-icon-512.png', icon, 512, 512],
  ['store-feature-1024x500.png', feature, 1024, 500],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<body style="margin:0;background:${INK}">${svg}</body>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: new URL('../docs/store/' + name, import.meta.url).pathname, omitBackground: false });
  console.log(`${name} ${width}x${height}`);
  await page.close();
}

await browser.close();
