// web/tokens.ts — the faces stop being digits.
//
// WHY PIPS, AND WHY THAT IS NOT A STYLE DECISION.
//
// `lattice/round.ts` pays `face(fed cell) x (1 + charge)`. The face is not a
// label on a tile; it is a NUMBER THE PLAYER MULTIPLIES. Choosing where to bank
// means comparing the magnitude of what one cell feeds against another. Six
// beautiful distinguishable emblems would give the board an identity system
// where the game needs a MAGNITUDE system, and the board would go quiet in a
// way no oracle in this repo could see: every policy in `verify-learnable`
// reads `observable[i * 3]` as an integer and never looks at a pixel.
//
// So the faces are pips, arranged in the canonical dice patterns that have
// carried quantity without literacy for two thousand years. `design/tokens.md`
// records the distribution this came out of. The corpus named it first: `dice
// charge pips` and `dice-class badges` are alleles in the pinned pool.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE GEOMETRY IS EXACT AND THE TEXTURE IS NOT, AND THEY ARE KEPT APART.
//
// Everything in this file is a fraction of the token's side, computed, never
// eyeballed. That is what lets `verify-tokens` check P1 (pips never touch),
// P2 (a component count recovers the face) and P3 (the centres are the
// canonical arrangement) as arithmetic rather than as opinion.
//
// The corpus-mined ground the pips sit on is the opposite kind of thing — it
// drifts, it gets re-mined, it is a matter of taste. It is therefore a separate
// layer, underneath, and it can be replaced without the magnitude moving with
// it. P4 measures the pip against whatever that ground turns out to be, in APCA
// on rendered pixels, so a texture that swallowed the pips would fail rather
// than merely look worse.
//
// TWO AUDITOR REJECTIONS ARE BUILT INTO THAT SPLIT. The first draft checked
// only "can an algorithm count the pips", and the auditor answered that this
// measures topological discreteness, not magnitude perception — a 6 whose pips
// touch reads as a 1, failing art a human could still read. Hence P1 as a
// PRECONDITION for P2, and P3 for the gestalt channel people actually use. The
// second draft was rejected again for validating that the graphics are discrete
// without validating that they are perceptually salient. Hence P4. Neither
// check was in the plan; both are in the gate.
// ─────────────────────────────────────────────────────────────────────────────

/** The six numbered faces, plus the four named tokens the corpus supplies. */
export type TokenKind = 1 | 2 | 3 | 4 | 5 | 6 | 'wild' | 'bomb' | 'locked' | 'frozen';

/** Idle, charged, spent. The plan's three states, applied to every token. */
export type TokenState = 'idle' | 'charged' | 'spent';

/** A point inside the unit token square, both coordinates in [0, 1]. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Pip radius, as a fraction of the token's side.
 *
 * Chosen against P1 rather than by eye. The closest two pips in any canonical
 * arrangement are one grid step apart (`GRID[1] - GRID[0]` = 0.24), so the
 * clear ground between them is `0.24 - 2 * PIP_R` = 0.07 of the side. At the
 * smallest cell the board ever renders that is comfortably more than the one
 * device pixel P1 demands, and `verify-tokens` recomputes it rather than
 * trusting this comment.
 */
export const PIP_R = 0.085;

/**
 * The band at the token's edge that the FACE never enters.
 *
 * IT EXISTS BECAUSE A SCREENSHOT SHOWED THE BUG THE ORACLE COULD NOT.
 * `verify-tokens` P2 rasterises a token ALONE and counts its pips, and it was
 * green. The board renders the token with the charge amount written over it as
 * `+1`, and on a 6 that text sat squarely across the middle two pips. The face
 * value — the number the player multiplies — was being covered up by the game's
 * own HUD, on exactly the faces where it matters most.
 *
 * So the token now owns its charge indicator instead of having one dropped on
 * top, and the two are kept apart by construction: everything that carries the
 * FACE lives inside this inset, everything that carries STATE lives outside it.
 * `PIP_R` and `GRID` put the nearest pip edge at 0.175; the ticks stop at 0.14.
 * P8 checks both, so the separation is arithmetic rather than a convention
 * somebody remembers.
 */
export const FACE_REGION = 0.16;

/** The three-column grid every canonical dice face is laid out on. */
export const GRID: readonly [number, number, number] = [0.26, 0.5, 0.74];

const [LO, MID, HI] = GRID;

/**
 * The canonical arrangements. These are not a choice.
 *
 * A die reads at a glance because the pattern is recognised, not because the
 * dots are counted — the gestalt channel the auditor named. 3 is a diagonal, 4
 * is corners, 6 is two columns. Inventing a prettier arrangement would break
 * the one channel that makes a die legible faster than a digit, so P3 pins
 * these centres and any drift from them fails the build.
 */
export const PIP_LAYOUT: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, readonly Point[]>> = {
  1: [{ x: MID, y: MID }],
  2: [{ x: LO, y: LO }, { x: HI, y: HI }],
  3: [{ x: LO, y: LO }, { x: MID, y: MID }, { x: HI, y: HI }],
  4: [{ x: LO, y: LO }, { x: HI, y: LO }, { x: LO, y: HI }, { x: HI, y: HI }],
  5: [{ x: LO, y: LO }, { x: HI, y: LO }, { x: MID, y: MID }, { x: LO, y: HI }, { x: HI, y: HI }],
  6: [
    { x: LO, y: LO }, { x: HI, y: LO },
    { x: LO, y: MID }, { x: HI, y: MID },
    { x: LO, y: HI }, { x: HI, y: HI },
  ],
};

/** The numbered faces, for iteration. */
export const FACES: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

/** Every token this module can draw. */
export const KINDS: readonly TokenKind[] = [...FACES, 'wild', 'bomb', 'locked', 'frozen'];

/** The corpus allele each named token is drawn from. Provenance, per token. */
export const TOKEN_PROVENANCE: Readonly<Record<string, string>> = {
  face: 'dice-class badges',
  pip: 'dice charge pips',
  wild: 'wild tile',
  bomb: 'prismatic bomb',
  locked: 'locked portcullis tile',
  frozen: 'cryo-frozen dice',
};

/** True for a token whose value is a magnitude the player does arithmetic on. */
export function isNumeric(kind: TokenKind): kind is 1 | 2 | 3 | 4 | 5 | 6 {
  return typeof kind === 'number';
}

/**
 * The smallest clear gap between any two pips on a face, as a fraction of the
 * side. P1's subject, computed rather than asserted.
 *
 * Returns Infinity for a face with fewer than two pips, which is the honest
 * answer: a 1 has no pair to separate, and reporting 0 would make P1 fail on a
 * face that cannot possibly merge.
 */
export function minPipGap(face: 1 | 2 | 3 | 4 | 5 | 6): number {
  const pips = PIP_LAYOUT[face];
  let min = Infinity;
  for (let i = 0; i < pips.length; i += 1) {
    for (let j = i + 1; j < pips.length; j += 1) {
      const a = pips[i]!;
      const b = pips[j]!;
      const centres = Math.hypot(a.x - b.x, a.y - b.y);
      min = Math.min(min, centres - 2 * PIP_R);
    }
  }
  return min;
}

/** Colours a token is painted in. Supplied by the caller so the palette stays
 *  in `web/theme.ts` and this file never invents one. */
export interface TokenPaint {
  /** The pip fill, and the emblem stroke. */
  readonly ink: string;
  /** The token ground the pips sit on. P4 measures ink against this. */
  readonly ground: string;
  /** The edge, and the charged ring. */
  readonly edge: string;
  /** The charge accent, used only by the charged state. */
  readonly accent: string;
}

/** How a state changes the paint. Geometry never moves between states — a
 *  charged 5 is still a 5, and a player under time pressure should never have
 *  to re-read the face because its lighting changed. */
function stateStyle(state: TokenState): { opacity: number; ring: boolean } {
  switch (state) {
    case 'charged': return { opacity: 1, ring: true };
    case 'spent': return { opacity: 0.45, ring: false };
    default: return { opacity: 1, ring: false };
  }
}

const f = (n: number): string => Number(n.toFixed(4)).toString();

/** The named tokens, as path data in the unit square. Shape carries the
 *  identity, so each is recognisable with hue removed — the colour-blind case,
 *  and also the greyscale one P2 runs in. */
function emblem(kind: 'wild' | 'bomb' | 'locked' | 'frozen', paint: TokenPaint): string {
  switch (kind) {
    // `wild tile` / `wild W symbol`, n=12 and n=6 in the pool. A W, drawn as
    // strokes so it survives being small.
    case 'wild':
      return `<path d="M0.22,0.3 L0.34,0.72 L0.5,0.44 L0.66,0.72 L0.78,0.3"
        fill="none" stroke="${paint.ink}" stroke-width="0.1"
        stroke-linecap="round" stroke-linejoin="round"/>`;
    // `prismatic bomb` n=12, `standard bomb's depleting ring` n=8. A body and
    // the ring the corpus describes, which is also what makes it unmistakable
    // against a round pip.
    //
    // THE RING IS SOLID, AND IT WAS DASHED UNTIL P2 SAID OTHERWISE. A dashed
    // ring is the obvious way to draw "depleting", and it rasterised to NINE
    // separate marks — a bomb that reads as a face value of 9 on a board where
    // the face value is a number the player multiplies. That is precisely the
    // misreading P2 exists to catch, and it caught it on the first run, on
    // artwork that looked entirely reasonable. Depletion is shown by sweeping
    // the arc, which is one mark at every stage of it.
    case 'bomb':
      return `<circle cx="0.5" cy="0.56" r="0.24" fill="${paint.ink}"/>` +
        `<circle cx="0.5" cy="0.56" r="0.33" fill="none" stroke="${paint.accent}"
          stroke-width="0.05"/>` +
        `<path d="M0.5,0.32 L0.5,0.18 L0.62,0.12" fill="none" stroke="${paint.ink}"
          stroke-width="0.06" stroke-linecap="round"/>`;
    // `locked portcullis tile` n=6. A portcullis is a grid, and a grid is the
    // one shape here that could be mistaken for pips — so it is drawn as
    // CONNECTED bars, which is exactly what makes P2 count it as one component.
    case 'locked':
      return `<path d="M0.24,0.26 H0.76 M0.24,0.5 H0.76 M0.24,0.74 H0.76
        M0.32,0.2 V0.8 M0.5,0.2 V0.8 M0.68,0.2 V0.8"
        fill="none" stroke="${paint.ink}" stroke-width="0.07" stroke-linecap="square"/>`;
    // `cryo-frozen dice` n=6. A six-armed crystal, connected at the centre.
    case 'frozen':
      return `<path d="M0.5,0.16 V0.84 M0.21,0.33 L0.79,0.67 M0.79,0.33 L0.21,0.67"
        fill="none" stroke="${paint.ink}" stroke-width="0.07" stroke-linecap="round"/>` +
        `<circle cx="0.5" cy="0.5" r="0.1" fill="${paint.ink}"/>`;
  }
}

/**
 * One token as an SVG fragment in a 0-1 viewBox.
 *
 * SVG RATHER THAN THE PLANNED PNG ATLAS, and the reason is not convenience.
 * The plan called for a single atlas PNG because atlases are how you keep a GPU
 * cheap — but the GL layer in this app draws LIGHT, not faces; the faces live in
 * DOM cells. An atlas there would buy nothing and cost sub-pixel sampling at
 * every device density, on artwork whose entire job is to stay countable at
 * 48px. `scripts/build-token-atlas.mjs` still rasterises these to a PNG for
 * anything that later wants them as a texture.
 */
/**
 * The corpus's own lighting, emitted ONCE per document and referenced by every
 * token.
 *
 * WHAT IS IN THE TILE, AND WHY IT IS NOT A GRADIENT SOMEBODY LIKED.
 * `scripts/mine-token-texture.py` downsamples all 1129 corpus images to 8x8,
 * subtracts each image's own mean so exposure cancels, and averages the
 * residuals. If the corpus had no shared composition the result would be noise
 * near zero. It is a clean VIGNETTE instead — corners near -19, an upper-centre
 * lobe near +17, 39 of 255 peak to peak. The corpus is centre-lit and
 * edge-darkened, consistently, across every image in it. That was never stated
 * in a prompt; it was only ever in the pixels.
 *
 * So a die here is lit the way the corpus lights everything, and the claim is
 * checkable: the tile is pinned in `design/token-texture.json` with a digest and
 * `verify-tokens` P7 recomputes it from the corpus.
 *
 * THE BLUR IS DECLARED, THE DATA IS NOT APPROXIMATED. Eight cells across a 48px
 * tile would band visibly, so the blocks are softened by one cell's width —
 * exactly the interpolation a browser applies when it scales an 8x8 image. The
 * measured offsets are emitted verbatim; only their display is smoothed.
 */
export function tokenDefs(tile: readonly number[], ground: string, grid = 8): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" ` +
    `style="position:absolute">${tokenDefsMarkup(tile, ground, grid)}</svg>`;
}

/**
 * The same defs WITHOUT a wrapping `<svg>`, for inlining into one token.
 *
 * IT EXISTS BECAUSE THE ORACLE CAUGHT A REAL BUG, not because two callers
 * wanted two shapes. `verify-tokens` rasterises a token by serialising it to a
 * data URI, and a data URI is a document of its own: a `fill="url(#glaas-grain)"`
 * pointing at a pattern defined in a SIBLING `<svg>` back on the page resolves
 * to nothing there. The first run of P4 reported |Lc| 0.0 with the lighting
 * "composited" — not a texture that ate the contrast, a texture that was never
 * drawn, and P2 failed on all six charged faces for the same reason.
 *
 * On the page the defs stay emitted once and shared, which is the whole point
 * of a pattern. In the oracle they are inlined, so the thing measured is a
 * complete document. Same markup either way.
 */
export function tokenDefsMarkup(tile: readonly number[], ground: string, grid = 8): string {
  const step = 1 / grid;
  const cells: string[] = [];
  for (let i = 0; i < tile.length; i += 1) {
    const gx = (i % grid) * step;
    const gy = Math.floor(i / grid) * step;
    // The offset is a luminance shift, applied as a white or black veil at the
    // measured strength. Painting a shifted COLOUR would have invented a hue
    // the corpus never measured.
    const v = tile[i]!;
    const shade = v >= 0 ? '#ffffff' : '#000000';
    const alpha = Math.min(0.5, Math.abs(v) / 255 * 2.2);
    cells.push(`<rect x="${f(gx)}" y="${f(gy)}" width="${f(step * 1.02)}" ` +
      `height="${f(step * 1.02)}" fill="${shade}" opacity="${f(alpha)}"/>`);
  }
  return `<defs>` +
    `<filter id="glaas-soft" x="-20%" y="-20%" width="140%" height="140%">` +
      `<feGaussianBlur stdDeviation="${f(step * 0.6)}"/></filter>` +
    `<pattern id="glaas-grain" width="1" height="1" patternContentUnits="objectBoundingBox">` +
      `<rect width="1" height="1" fill="${ground}"/>` +
      `<g filter="url(#glaas-soft)">${cells.join('')}</g>` +
    `</pattern></defs>`;
}

export function tokenSvg(kind: TokenKind, state: TokenState, paint: TokenPaint,
                         textured = true, inlineDefs = '', charge = 0): string {
  const { opacity, ring } = stateStyle(state);
  // `textured` exists so verify-tokens can measure the pips against the FLAT
  // ground and against the corpus-lit one separately. P4 runs both: a texture
  // that ate the contrast should be visible as the difference between them,
  // not hidden inside a single number.
  const ground = textured ? 'url(#glaas-grain)' : paint.ground;
  const body: string[] = [
    `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14"
      fill="${ground}" stroke="${paint.edge}" stroke-width="0.03"/>`,
  ];

  if (ring) {
    body.push(`<rect x="0.06" y="0.06" width="0.88" height="0.88" rx="0.11"
      fill="none" stroke="${paint.accent}" stroke-width="0.05"/>`);
  }

  // ── CHARGE, COUNTED RATHER THAN WRITTEN ─────────────────────────────────
  // Ticks on the top edge, one per point of charge, never more than
  // CHARGE_MAX = 3. Countable, for the same reason the face is: a player
  // comparing `face x (1 + charge)` across two cells is doing arithmetic on
  // both numbers, and one of them should not be a different kind of thing.
  // They sit outside FACE_REGION, so they cannot touch a pip and P2 does not
  // count them as part of the value.
  // The ticks fill the band between the token's border and FACE_REGION, rather
  // than sitting daintily inside it. A first pass drew them at 0.055 tall and
  // P8's vacuous control caught it: three ticks moved 16 pixels on a 48px
  // token, which is a mark nobody can see and a check that proves nothing.
  for (let i = 0; i < charge; i += 1) {
    const w = 0.11;
    const x = 0.5 + (i - (charge - 1) / 2) * (w + 0.04) - w / 2;
    body.push(`<rect x="${f(x)}" y="0.042" width="${f(w)}" height="0.098" rx="0.03" ` +
      `fill="${paint.accent}"/>`);
  }

  if (isNumeric(kind)) {
    for (const p of PIP_LAYOUT[kind]) {
      // `class="pip"` so the board can be asked, cell by cell, how many pips it
      // actually drew — see verify-tokens P9. Without it the only way to count
      // a rendered face is to rasterise it, and P9 has 36 cells to check.
      body.push(`<circle class="pip" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(PIP_R)}" `
        + `fill="${paint.ink}"/>`);
    }
  } else {
    body.push(emblem(kind, paint));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" ` +
    `role="presentation" focusable="false" style="opacity:${opacity}">` +
    `${inlineDefs}${body.join('')}</svg>`;
}
