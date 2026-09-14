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

export interface Vec { readonly x: number; readonly y: number; readonly z: number }

/**
 * A GHOST: where the marked body ends up if this action is the last thing that
 * happens. The whole design rests on these.
 *
 * ── WHY THE INTERFACE DRAWS FOURTEEN DOTS ───────────────────────────────────
 *
 * Three measured facts forced this and none of them is an aesthetic:
 *
 *   1. The DIRECTION of an intervention's effect is intuitive -- 95.4% of drops
 *      move the body within 45 degrees of where a player would expect, out to a
 *      120-step horizon. The MAGNITUDE is intuitive at no horizon at all.
 *   2. Every policy built out of direction alone failed: aim-twice reached 16.3%
 *      of the ceiling, the auditor's spin-then-aim 15.2%, against a random
 *      control at 12.8%.
 *   3. Perfect information with unchanged hands reached 49.7%, while finer
 *      control raised the absolute ceiling by -0.5 points. The shortfall was
 *      never in the player's hands. It was in what they could know.
 *
 * So the interface stops asking the player to ESTIMATE a magnitude and shows the
 * outcome instead. A nearest-neighbour comparison between fourteen dots and a
 * ring is the one spatial judgement humans make instantly and without training.
 *
 * ── AND WHY THEY ARE UV ─────────────────────────────────────────────────────
 *
 * The spectrum's rule is that a band whose colour lies about its content is a
 * defect rather than a style preference. A ghost is not matter: it is a
 * SYNTHETIC, COMPUTED future that does not exist in the universe being drawn.
 * UV is the band for exactly that. Painting a ghost in matter colours would
 * assert that a predicted position is a real one, which is the same class of lie
 * as game two's screen drawing equations the game had not produced.
 */
export interface Ghost {
  readonly pos: Vec;
  /** Three words at most, or the lattice is too clever for the game. */
  readonly label: string;
  /** Affordable under the remaining budget. Unaffordable ghosts are still drawn,
   *  because hiding them would hide the cost decision that makes them matter. */
  readonly affordable: boolean;
  /** This action loses the body entirely. IR: what might go wrong. */
  readonly escapes: boolean;
}

export interface DarkView {
  readonly universe: Universe;
  /** Past positions, most recent last. Drawn as a fading trail. */
  readonly trails: readonly (readonly { x: number; y: number; z: number }[])[];
  readonly label: string;
  /** Where the player is aiming an intervention, if anywhere. */
  readonly aim: { x: number; y: number; z: number } | null;
  /** Index of the body the player is steering. Drawn larger, with a halo. */
  readonly marked?: number;
  /** The scoring surface. ENGINE cyan, because it is what the engine reads. */
  readonly ring?: { readonly at: Vec; readonly r: number } | null;
  /** One per lattice action. */
  readonly ghosts?: readonly Ghost[];
  readonly budget?: { readonly spent: number; readonly total: number } | null;
  readonly shot?: { readonly index: number; readonly of: number };
  /** Omit for the wide view. Set to frame a decision. */
  readonly frame?: Frame;
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

/**
 * How the camera is framed.
 *
 * ── THE DECISION HAPPENED INSIDE A BLOB, AND ONLY THE SCREENSHOT SAID SO ────
 *
 * The first gate sheet drew all fourteen ghosts as a single overlapping cluster
 * roughly one body-width across, inside a view spanning some twenty-four world
 * units. Every number said the mechanic worked -- the ghost rule reaches 78.8%
 * of the ceiling where aiming reaches 16.3% -- and the picture said a player
 * could not execute it, because "pick the nearest dot" is not a decision when
 * the dots are one pixel apart.
 *
 * The cause is a scale mismatch, not a drawing bug: a round's displacements are
 * small next to the cluster that produces them. So a view may FRAME the
 * decision -- centre on the marked body and the ring, and zoom until the choice
 * is bigger than the ink. The universe panels keep the wide frame, because what
 * they are for is showing that there is a universe.
 *
 * This is exactly the class of defect standing rule (H) exists to catch, and it
 * is the second time it has caught one that every balance metric passed.
 */
export interface Frame { readonly cx: number; readonly cy: number; readonly cz: number; readonly zoom: number }
const WIDE: Frame = { cx: 0, cy: 0, cz: 0, zoom: 1 };

/** Perspective project with elevation. Depth drives size AND desaturation. */
function projectIn(f: Frame, x: number, y: number, z: number): { sx: number; sy: number; k: number } {
  const px = (x - f.cx) * f.zoom, py = (y - f.cy) * f.zoom, pz = (z - f.cz) * f.zoom;
  // Rotate about the x-axis so the z = 0 plane is seen obliquely.
  const yr = py * COS_E - pz * SIN_E;
  const zr = py * SIN_E + pz * COS_E;
  const d = CAM_Z - zr;
  const k = FOV / Math.max(6, d);
  return { sx: W / 2 + px * k, sy: H / 2 + yr * k, k: k / (FOV / CAM_Z) };
}

export function darkScreenSvg(v: DarkView): string {
  const f = v.frame ?? WIDE;
  const project = (x: number, y: number, z: number) => projectIn(f, x, y, z);
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

  // ── THE RING · the scoring surface, in ENGINE cyan ────────────────────────
  // Cyan is the band for what the engine reads, and the ring is precisely that:
  // the one region whose occupancy the scorer looks at. Drawn BEFORE the bodies
  // so matter occludes it rather than the reverse -- a target that paints over
  // the thing you are steering would be an interface fighting its own game.
  if (v.ring) {
    const c = project(v.ring.at.x, v.ring.at.y, v.ring.at.z);
    const rr = Math.max(9, v.ring.r * c.k * (FOV / CAM_Z));
    o.push(`<circle cx="${c.sx.toFixed(1)}" cy="${c.sy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${ENGINE}" opacity="0.07"/>`);
    o.push(`<circle cx="${c.sx.toFixed(1)}" cy="${c.sy.toFixed(1)}" r="${rr.toFixed(1)}" fill="none" stroke="${ENGINE}" stroke-width="1.7" opacity="0.85"/>`);
    o.push(`<circle cx="${c.sx.toFixed(1)}" cy="${c.sy.toFixed(1)}" r="2.4" fill="${ENGINE}" opacity="0.9"/>`);
  }

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
    // The marked body. A player steering "one of twelve identical dots" has no
    // noun in the sentence, and the whole design rests on the objective being a
    // named body reaching a named place.
    if (v.marked === i) {
      o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${(r + 6).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.92"/>`);
      o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${(r + 10).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="0.7" opacity="0.34"/>`);
    }
  }

  // ── THE GHOSTS · fourteen synthetic futures, in UV ────────────────────────
  //
  // Drawn LAST, over everything, because they are the thing being compared and
  // an occluded ghost is a ghost the player cannot pick. Each is a hollow ring,
  // never a filled disc: a filled dot at this size reads as a body, and a
  // prediction that looks like matter is the lie the spectrum rule forbids.
  //
  // The one nearest the ring gets a cyan tick, because "nearest" is what the
  // ENGINE computes -- the interface is showing its own arithmetic, not making a
  // recommendation. Everything else stays the player's judgement.
  if (v.ghosts && v.ghosts.length > 0 && v.ring) {
    const ringC = v.ring.at;
    let best = 0, bestD = Infinity;
    v.ghosts.forEach((g, i) => {
      const d = Math.hypot(g.pos.x - ringC.x, g.pos.y - ringC.y, g.pos.z - ringC.z);
      if (d < bestD && g.affordable && !g.escapes) { bestD = d; best = i; }
    });
    v.ghosts.forEach((g, i) => {
      const p = project(g.pos.x, g.pos.y, g.pos.z);
      // IR is what might go wrong, and losing the body is the thing that can.
      const stroke = g.escapes ? IR_CORE : UV;
      // Unaffordable ghosts are shown and dimmed rather than hidden: removing
      // them would remove the cost decision instead of presenting it.
      const op = g.escapes ? 0.75 : g.affordable ? 0.72 : 0.22;
      const rad = Math.max(3.0, 5.0 * p.k);
      o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${g.affordable ? 1.5 : 1.0}" opacity="${op}"/>`);
      if (!g.affordable && !g.escapes) {
        // A struck-through ring reads as "not available" without colour, which
        // is the only encoding that survives a colour-blind reader.
        const q = rad * 0.72;
        o.push(`<line x1="${(p.sx - q).toFixed(1)}" y1="${(p.sy + q).toFixed(1)}" x2="${(p.sx + q).toFixed(1)}" y2="${(p.sy - q).toFixed(1)}" stroke="${UV}" stroke-width="0.9" opacity="0.3"/>`);
      }
      if (i === best && bestD < Infinity) {
        o.push(`<circle cx="${p.sx.toFixed(1)}" cy="${p.sy.toFixed(1)}" r="${(rad + 4).toFixed(1)}" fill="none" stroke="${ENGINE}" stroke-width="1.3" opacity="0.9"/>`);
      }
    });
  }

  // ── THE BUDGET · a bar, because a number is not a quantity ────────────────
  if (v.budget) {
    const frac = Math.max(0, Math.min(1, 1 - v.budget.spent / v.budget.total));
    const bw = 168, bx = 22, by = H - 34;
    o.push(`<rect x="${bx}" y="${by}" width="${bw}" height="7" rx="3.5" fill="#ffffff" opacity="0.10"/>`);
    // It goes IR as it empties: what might go wrong is running out mid-round.
    const col = frac > 0.5 ? ENGINE : frac > 0.22 ? UV : IR_CORE;
    o.push(`<rect x="${bx}" y="${by}" width="${(bw * frac).toFixed(1)}" height="7" rx="3.5" fill="${col}" opacity="0.85"/>`);
    o.push(`<text x="${bx}" y="${by - 7}" font-family="ui-monospace,monospace" font-size="10" fill="#8fa3b8" letter-spacing="1.5">BUDGET ${(v.budget.total - v.budget.spent).toFixed(1)} / ${v.budget.total.toFixed(1)}</text>`);
  }
  if (v.shot) {
    o.push(`<text x="${W - 22}" y="${H - 27}" text-anchor="end" font-family="ui-monospace,monospace" font-size="11" fill="#8fa3b8" letter-spacing="1.5">SHOT ${v.shot.index} OF ${v.shot.of}</text>`);
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
