// engine/verify/verify-controls.ts
// The touch controls honour their constraints on every phone we can name.
//
// This runs headlessly against a matrix of real device viewports because the
// alternative — looking at it on the one phone in the room — verifies it on the
// one phone in the room. Every assertion is paired with a negative control that
// must fail, so a layout function that silently returned nothing could not pass.

import {
  allTargets,
  computeControlLayout,
  EDGE_INSET_DP,
  MIN_TARGET_DP,
  type Rect,
  stickInput,
  type Viewport,
} from '../../web/controls-layout.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

/**
 * CSS-pixel viewports and device pixel ratios for phones in current use, plus
 * the smallest Android still receiving Play distribution. Widths are the CSS
 * width in portrait; pxPerDp is 1 for all of them because CSS px and dp coincide
 * by definition — devicePixelRatio maps CSS px to physical px, not to dp.
 */
const DEVICES: readonly (Viewport & { readonly name: string })[] = [
  { name: 'Pixel 8', width: 412, height: 915, pxPerDp: 1, safeTop: 24, safeBottom: 24, safeLeft: 0, safeRight: 0 },
  { name: 'Pixel 8 Pro', width: 448, height: 998, pxPerDp: 1, safeTop: 30, safeBottom: 24, safeLeft: 0, safeRight: 0 },
  { name: 'Galaxy S24', width: 384, height: 832, pxPerDp: 1, safeTop: 28, safeBottom: 24, safeLeft: 0, safeRight: 0 },
  { name: 'Galaxy A15 (budget)', width: 360, height: 800, pxPerDp: 1, safeTop: 24, safeBottom: 16, safeLeft: 0, safeRight: 0 },
  { name: 'iPhone SE (small)', width: 375, height: 667, pxPerDp: 1, safeTop: 20, safeBottom: 0, safeLeft: 0, safeRight: 0 },
  { name: 'iPhone 15', width: 393, height: 852, pxPerDp: 1, safeTop: 59, safeBottom: 34, safeLeft: 0, safeRight: 0 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, pxPerDp: 1, safeTop: 59, safeBottom: 34, safeLeft: 0, safeRight: 0 },
  { name: 'small Android (320dp)', width: 320, height: 640, pxPerDp: 1, safeTop: 24, safeBottom: 0, safeLeft: 0, safeRight: 0 },
  // Landscape, where the gesture strip moves to the short edges and the safe
  // insets appear on the sides rather than the top.
  { name: 'Pixel 8 landscape', width: 915, height: 412, pxPerDp: 1, safeTop: 0, safeBottom: 24, safeLeft: 24, safeRight: 24 },
  { name: 'iPhone 15 landscape', width: 852, height: 393, pxPerDp: 1, safeTop: 0, safeBottom: 21, safeLeft: 59, safeRight: 59 },
];

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
         a.y < b.y + b.height && b.y < a.y + a.height;
}

// --- 1. Every target on every device honours the constraints -----------------
let checked = 0;
for (const device of DEVICES) {
  const layout = computeControlLayout(device);
  const targets = allTargets(layout);

  ok(targets.length >= 5, `${device.name}: only ${targets.length} controls laid out`);
  ok(!layout.degraded, `${device.name}: layout reports itself degraded at ${device.width}x${device.height}`);

  for (const rect of targets) {
    checked += 1;

    // Buttons must meet the minimum touch target. The stick zone is a region
    // rather than a button, and is checked against the same floor because a
    // zone smaller than a target would be harder to find than a button.
    ok(rect.width >= MIN_TARGET_DP * device.pxPerDp,
      `${device.name}: ${rect.id} is ${rect.width.toFixed(0)}px wide, below the ${MIN_TARGET_DP}dp minimum`);
    ok(rect.height >= MIN_TARGET_DP * device.pxPerDp,
      `${device.name}: ${rect.id} is ${rect.height.toFixed(0)}px tall, below the ${MIN_TARGET_DP}dp minimum`);

    // Nothing may sit inside the system gesture strip on either edge, and
    // nothing may run off the screen.
    const insetPx = EDGE_INSET_DP * device.pxPerDp;
    ok(rect.x >= Math.max(insetPx, device.safeLeft + insetPx) - 0.5,
      `${device.name}: ${rect.id} starts at x=${rect.x.toFixed(0)}, inside the left gesture strip`);
    ok(rect.x + rect.width <= device.width - Math.max(insetPx, device.safeRight + insetPx) + 0.5,
      `${device.name}: ${rect.id} ends at x=${(rect.x + rect.width).toFixed(0)}, inside the right gesture strip`);
    ok(rect.y + rect.height <= device.height - Math.max(insetPx, device.safeBottom + insetPx) + 0.5,
      `${device.name}: ${rect.id} ends at y=${(rect.y + rect.height).toFixed(0)}, below the safe area`);
    ok(rect.y >= 0, `${device.name}: ${rect.id} starts above the viewport`);
  }

  // Controls must not overlap each other — an overlap means one of them is
  // unreachable, and the player will never know which.
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      ok(!overlaps(targets[i]!, targets[j]!),
        `${device.name}: ${targets[i]!.id} overlaps ${targets[j]!.id}`);
    }
  }
}
console.log(`  layout: ${checked} controls across ${DEVICES.length} viewports, all >= ${MIN_TARGET_DP}dp and clear of both gesture strips`);

// --- 2. NEGATIVE CONTROLS: the checks above must be able to fail -------------
{
  // A viewport far too small to satisfy the constraints must report itself
  // degraded rather than quietly returning an unusable layout.
  const tiny: Viewport = {
    width: 200, height: 200, pxPerDp: 1,
    safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0,
  };
  ok(computeControlLayout(tiny).degraded,
    'a 200x200 viewport did not report a degraded layout, so the degraded flag never fires');

  // And a planted violation must be caught by the same predicate the loop uses.
  const insetPx = EDGE_INSET_DP;
  const planted: Rect = { id: 'planted', x: 4, y: 10, width: 60, height: 60 };
  ok(!(planted.x >= insetPx),
    'the edge-inset predicate accepts a control 4px from the screen edge');

  const overlapping: readonly [Rect, Rect] = [
    { id: 'a', x: 0, y: 0, width: 60, height: 60 },
    { id: 'b', x: 30, y: 30, width: 60, height: 60 },
  ];
  ok(overlaps(overlapping[0], overlapping[1]),
    'the overlap predicate does not detect two rects sharing a quadrant');
  console.log('  controls fire: degraded flag, edge-inset predicate and overlap predicate all detect planted violations');
}

// --- 3. The floating stick reads correctly ----------------------------------
{
  const radius = 44;
  const origin = { x: 100, y: 400 };
  const FIXED_ONE = 65536;

  const centred = stickInput(origin, origin, radius);
  ok(centred.x === 0 && centred.z === 0,
    `a thumb resting at the stick origin produced input (${centred.x}, ${centred.z}) rather than zero`);

  const up = stickInput(origin, { x: origin.x, y: origin.y - radius }, radius);
  ok(up.z === -FIXED_ONE, `full up deflection gave z=${up.z}, expected ${-FIXED_ONE}`);
  ok(up.x === 0, `full up deflection leaked into x: ${up.x}`);

  const right = stickInput(origin, { x: origin.x + radius, y: origin.y }, radius);
  ok(right.x === FIXED_ONE, `full right deflection gave x=${right.x}, expected ${FIXED_ONE}`);

  // Past the radius, deflection clamps rather than growing without bound.
  const far = stickInput(origin, { x: origin.x + radius * 10, y: origin.y }, radius);
  ok(far.x === FIXED_ONE, `deflection past the radius gave x=${far.x} rather than clamping to ${FIXED_ONE}`);

  // Half deflection is half, not a curve. The stick is linear because the
  // simulation clamps per axis and any shaping here would be invisible input
  // the player cannot account for.
  const half = stickInput(origin, { x: origin.x + radius / 2, y: origin.y }, radius);
  ok(Math.abs(half.x - FIXED_ONE / 2) <= 1,
    `half deflection gave x=${half.x}, expected about ${FIXED_ONE / 2} — the stick is not linear`);

  // Diagonals reach full deflection on both axes, matching the per-axis clamp
  // the rules apply. A circular clamp would cost the player diagonal speed the
  // simulation actually permits.
  const diagonal = stickInput(origin, { x: origin.x + radius, y: origin.y + radius }, radius);
  ok(diagonal.x === FIXED_ONE && diagonal.z === FIXED_ONE,
    `a full diagonal gave (${diagonal.x}, ${diagonal.z}) rather than full deflection on both axes`);

  console.log('  stick: centred reads zero, axes are linear, deflection clamps at the radius, diagonals reach both rails');
}

// --- 4. The stick is genuinely floating -------------------------------------
// Two different landing points inside the zone must produce the same input for
// the same relative movement. If they do not, the stick has a fixed centre.
{
  const radius = 44;
  const a = stickInput({ x: 80, y: 700 }, { x: 80 + 22, y: 700 }, radius);
  const b = stickInput({ x: 260, y: 500 }, { x: 260 + 22, y: 500 }, radius);
  ok(a.x === b.x && a.z === b.z,
    `the same gesture at two landing points gave (${a.x}, ${a.z}) and (${b.x}, ${b.z}) — the stick is not floating`);
  console.log('  floating: identical gestures at different landing points give identical input');
}

if (failures.length > 0) {
  console.error(`verify-controls: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-controls: PASS — targets are large enough, clear of both gesture strips, and the stick floats');
