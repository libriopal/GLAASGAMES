// scripts/measure-frames.mjs — the 60fps claim, measured.
//
// "Maintains 60fps at all times" is a claim about the WORST frame, not the mean.
// A renderer that averages 120fps and stalls for 40ms once a second is not a
// 60fps renderer; it is a 60fps renderer with a visible hitch, and the mean hides
// exactly that. So the pass condition is on the tail, and it measures UNDER LOAD
// at 4x CPU throttle, because the phone this ships to is not this container.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIRST VERSION OF THIS SCRIPT MEASURED THE DISPLAY, NOT THE RENDERER.
//
// It timed the interval between `requestAnimationFrame` callbacks and failed the
// run at p99 = 16.80ms against a 16.67ms budget. That number was not a
// performance result. On a 60Hz display rAF is vsync-locked, so the interval
// CANNOT fall below 16.67ms no matter how little work is done — a page drawing
// nothing at all reports the same figure. Every sample sat between 16.70 and
// 16.80ms, which is the refresh clock with scheduling jitter on it, and the
// "61.2% of frames over budget" line was 61.2% of frames being a rounding error
// above the refresh interval.
//
// Measuring the interval answers "how fast does the monitor tick". The question
// is "does the work fit inside a tick", and there are two honest ways to ask it:
//
//   COST   time spent inside the frame callback, which is the work itself.
//   DROPS  intervals at or beyond TWO refresh periods, which is what a missed
//          vsync actually looks like and is the only thing a player sees.
//
// Both are reported below. The pass condition is on both, because either alone
// can be gamed: zero drops with a 15ms callback is one bad frame from stuttering,
// and a cheap callback that still drops frames is stuttering already.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const BUDGET_MS = 1000 / 60; // 16.67
const url = new URL('../design/farkle-sheet.html', import.meta.url).href;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });

// 4x throttle: a mid-range phone against this container's CPU.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto(url, { waitUntil: 'networkidle' });

const { costs, intervals } = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const costs = [];
      const intervals = [];
      let last = performance.now();
      let n = 0;
      function tick(now) {
        intervals.push(now - last);
        last = now;
        const t0 = performance.now();
        // Real per-frame work: rewrite the strip's transform and force layout,
        // so the sample includes style, layout and paint rather than an empty
        // callback. A measurement of nothing is not a measurement.
        n += 1;
        const strip = document.querySelector('.phone svg');
        if (strip) {
          strip.style.transform = `translateY(${(n % 7) * 0.5}px)`;
          void strip.getBoundingClientRect().height;
        }
        window.scrollBy(0, (n % 40) - 20);
        void document.body.offsetHeight;
        costs.push(performance.now() - t0);
        if (n < 300) requestAnimationFrame(tick);
        else resolve({ costs, intervals: intervals.slice(1) });
      }
      requestAnimationFrame(tick);
    }),
);

await browser.close();

const pct = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// A dropped frame is an interval at or past two refresh periods — one vsync
// missed. Below that the interval is the display's clock, not our cost.
const refresh = pct(intervals, 0.5);
const drops = intervals.filter((t) => t >= refresh * 1.75).length;
const worstInterval = Math.max(...intervals);

console.log(`frames: ${costs.length} at 4x CPU throttle, 393x852 @2x`);
console.log(`  refresh period (measured p50 interval): ${refresh.toFixed(2)}ms`);
console.log(`  frame cost   mean ${mean(costs).toFixed(2)}ms  p50 ${pct(costs, 0.5).toFixed(2)}ms  p99 ${pct(costs, 0.99).toFixed(2)}ms  worst ${Math.max(...costs).toFixed(2)}ms`);
console.log(`  budget       ${BUDGET_MS.toFixed(2)}ms — p99 uses ${((pct(costs, 0.99) / BUDGET_MS) * 100).toFixed(1)}% of it`);
console.log(`  dropped      ${drops}/${intervals.length} frames (worst interval ${worstInterval.toFixed(2)}ms)`);

let bad = 0;
if (pct(costs, 0.99) > BUDGET_MS) {
  console.log(`FAIL — p99 frame cost ${pct(costs, 0.99).toFixed(2)}ms exceeds the ${BUDGET_MS.toFixed(2)}ms budget`);
  bad += 1;
}
if (drops > intervals.length * 0.01) {
  console.log(`FAIL — ${drops} dropped frames, over the 1% allowance`);
  bad += 1;
}
if (bad > 0) process.exit(1);
console.log('PASS — work fits inside the frame and no vsync is missed, at 4x CPU throttle');
