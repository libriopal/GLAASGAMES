// web/dark-screen.ts — a seeded universe, drawn before it is balanced.
//
// Revision H of the approved plan: RENDER BEFORE MEASURING. Game two's deepest
// visual defect was a RULE interacting with a readout -- the display's brightest
// state was unreachable because an order ships the instant its molecule exists,
// and no amount of balancing would have found it. One screenshot did. A 3D
// universe has a far larger surface for that class of defect than a grid.
//
// Perspective projection to SVG rather than WebGL, deliberately: the gate needs
// a still image that can be checked into the repository and compared, and the
// vertex pipeline is a separate claim that gets its own gate. A game that is
// only good because it looks good has not passed.

import { ENGINE, IR_CORE, MATTER, UV, VOID_DEEP, mixRgb, toCss } from './spectrum.js';
import { toFloat } from '../game/dark/fixed.js';
import { type Universe, totalEnergy } from '../game/dark/nbody.js';

const hex = (s: string) => ({ r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16) });

export interface DarkView {
  readonly universe: Universe;
  /** Past positions, most recent last. Drawn as a fading trail. */
  readonly trails: readonly (readonly { x: number; y: number; z: number }[])[];
  readonly label: string;
  /** Where the player is aiming an intervention, if anywhere. */
  readonly aim: { x: number; y: number; z: number } | null;
}

const W = 640, H = 560;
const FOV = 430;
const CAM_Z = 26;

/**
 * Camera elevation, radians. NOT optional, and the first version omitted it.
 *
 * ── A PLANE VIEWED EDGE-ON PROJECTS TO A LINE, AND THAT IS WHAT SHIPPED ─────
 *
 * The first projection was `sy = H/2 + y * k * 0.62` with no rotation, so every
 * point on the y = 0 plane mapped to sy = H/2 exactly. The reference grid --
 * whose entire job was making depth readable -- rendered as ONE HORIZONTAL LINE,
 * and the universe read as a flat scatter.
 *
 * It was the render lying, not the physics. Measured over 5 seeds, the spatial
 * standard deviation in z is 19-30% of x: a genuine thick disc, which is what a
 * galaxy is. The camera was simply looking along the plane it was drawing.
 *
 * This is exactly the class of defect revision H exists to catch -- a
 * presentation choice that would have survived the entire factor screen, because
 * Lyapunov, attribution and branching would all have measured a correctly
 * three-dimensional system that nobody could see.
 */
const ELEV = 0.42;
const SIN_E = Math.sin(ELEV), COS_E = Math.cos(ELEV);

/** Perspective project with elevation. Depth drives size AND desaturation. */
function project(x: number, y: number, z: number): { sx: number; sy: number; k: number } {
  // Rotate about the x-axis so the z = 0 plane is seen obliquely.
  const yr = y * COS_E - z * SIN_E;
  const zr = y * SIN_E + z * COS_E;
  const d = CAM_Z - zr;
  const k = FOV / Math.max(6, d);
  return { sx: W / 2 + x * k, sy: H / 2 + yr * k, k: k / (FOV / CAM_Z) };
}

export function darkScreenSvg(v: DarkView): string {
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  o.push(`<rect width="${W}" height="${H}" fill="${VOID_DEEP}"/>`);

  // A faint reference grid on the z=0 plane, so depth is readable at all.
  // Without it a 3D scatter is indistinguishable from a 2D one.
  for (let i = -4; i <= 4; i += 1) {
    const a = project(i * 3, 0, -12), b = project(i * 3, 0, 12);
    o.push(`<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" x2="${b.sx.toFixed(1)}" y2="${b.sy.toFixed(1)}" stroke="${ENGINE}" stroke-width="0.5" opacity="0.10"/>`);
    const c = project(-12, 0, i * 3), d = project(12, 0, i * 3);
    o.push(`<line x1="${c.sx.toFixed(1)}" y1="${c.sy.toFixed(1)}" x2="${d.sx.toFixed(1)}" y2="${d.sy.toFixed(1)}" stroke="${ENGINE}" stroke-width="0.5" opacity="0.10"/>`);
  }

  // Trails: where each body HAS been. This is the only thing that makes a
  // momentum system legible in a still frame -- without it, a photograph of an
  // orbit and a photograph of a standstill are the same picture.
  v.trails.forEach((tr, i) => {
    if (tr.length < 2) return;
    const pts = tr.map((p) => { const q = project(p.x, p.y, p.z); return `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`; });
    o.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${MATTER[(i % 6) + 1]}" stroke-width="1.2" opacity="0.32"/>`);
  });

  // Bodies, painted back to front so nearer ones occlude.
  const order = v.universe.bodies
    .map((b, i) => ({ b, i, z: toFloat(b.pos.z) }))
    .sort((a, c) => a.z - c.z);
  for (const { b, i } of order) {
    const x = toFloat(b.pos.x), y = toFloat(b.pos.y), z = toFloat(b.pos.z);
    const p = project(x, y, z);
    const r = Math.max(2.2, 5.5 * p.k * (0.6 + toFloat(b.mass) * 0.5));
    const base = hex(MATTER[(i % 6) + 1]!);
    // Depth desaturates rather than dims, the two-axis separation that fixed
    // Farkle's out-of-hand dice. Dimming alone loses distant bodies entirely.
    const keep = Math.max(0.25, Math.min(1, p.k));
    const yv = Math.round(0.2126*base.r + 0.7152*base.g + 0.0722*base.b);
    const col = toCss(mixRgb({ r: yv, g: yv, b: yv }, base, keep));
    o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}"/>`);
  }

  if (v.aim !== null) {
    const p = project(v.aim.x, v.aim.y, v.aim.z);
    o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="18" fill="none" stroke="${UV}" stroke-width="1.6" opacity="0.9"/>`);
    o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="3" fill="${UV}"/>`);
  }

  o.push(`<text x="22" y="34" font-family="ui-monospace,monospace" font-size="15" fill="#dfe9f5" letter-spacing="2">${v.label}</text>`);
  o.push(`<text x="${W - 22}" y="34" text-anchor="end" font-family="ui-monospace,monospace" font-size="11" fill="#8fa3b8">step ${v.universe.step} · ${v.universe.bodies.length} bodies · E ${toFloat(totalEnergy(v.universe.bodies)).toFixed(2)}</text>`);
  o.push('</svg>');
  return o.join('');
}
