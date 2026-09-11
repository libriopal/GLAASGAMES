// web/belief-widget.ts — draws the encoding the search chose, and only that one.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE MAKES NO DESIGN DECISIONS.
//
// Every number it uses comes from `DECLARED_BEST_ID` and `DECLARED_BEST_PARAMS`,
// which `verify-belief` B5 re-derives from the search on every run. If somebody
// prefers a rounder `reach`, the way to change it is to change the fitness
// function or the grammar and let the search answer again — not to edit a
// constant here, which B5 would catch and which would silently un-do the one
// property this whole cycle was for.
//
// The renderer is deliberately dumb for the same reason `net/heat-server.ts` is:
// a second place where the design gets decided is a second place for it to
// drift, with nothing to notice.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE PLAYER IS LOOKING AT.
//
// An arc of five marks swept along the direction charge has tended to go, its
// length set by how strongly the evidence points that way, and its brightness by
// how much evidence there is. The arc brightens toward its leading end, so the
// sweep reads as a heading rather than as a decorative curve.
//
// It shows the player's OWN RECONSTRUCTION. It cannot show the lattice, because
// nothing on the client has it: `board.observable()` carries face, state and
// charge and nothing else. A wrong belief is drawn exactly as confidently as a
// right one, which is the honest behaviour — the widget is a memory aid, not a
// hint.

import { type BeliefState } from '../foundry/visual/belief.js';
import { type Mark, encodings } from '../foundry/visual/encodings.js';
import { DECLARED_BEST_ID, DECLARED_BEST_PARAMS } from '../foundry/visual/evolve.js';
import { rampColour } from './lc-ramp.js';
import { GROUND, GROUND_EDGE, toHex } from './theme.js';

const CHOSEN = encodings().find((c) => c.id === DECLARED_BEST_ID);
if (CHOSEN === undefined) {
  // A renderer that silently drew nothing would be worse than one that refuses
  // to load: the widget would simply be absent and nobody would know why.
  throw new RangeError(
    `belief-widget: the declared encoding ${DECLARED_BEST_ID} is not in the grammar. ` +
      'The search and the renderer have parted company; run search:belief and re-declare.',
  );
}

/** The marks for a belief, in unit coordinates. */
export function beliefMarks(b: BeliefState): Mark[] {
  return CHOSEN.encodeWith(b, DECLARED_BEST_PARAMS);
}

/**
 * The widget as standalone SVG markup, sized in its own unit square.
 *
 * A complete `<svg>` with its own `viewBox`, because `web/tokens.ts` records
 * what happens otherwise: a caller nested one complete SVG inside another and
 * got an empty plate, which only a screenshot caught. Callers place this with
 * layout, never by nesting.
 */
export function beliefSvg(b: BeliefState, px = 96): string {
  const marks = beliefMarks(b);
  const circles = marks
    .map((m) => {
      const c = rampColour(m.intensity);
      return `<circle cx="${m.x.toFixed(4)}" cy="${m.y.toFixed(4)}" r="${m.r.toFixed(4)}" ` +
        `fill="${toHex(c)}"/>`;
    })
    .join('');
  return `<svg width="${px}" height="${px}" viewBox="0 0 1 1" role="img" ` +
    `aria-label="${ariaLabel(b)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="1" height="1" rx="0.08" fill="${GROUND}" stroke="${GROUND_EDGE}" ` +
    `stroke-width="0.012"/>${circles}</svg>`;
}

/**
 * The same information as words.
 *
 * Not an afterthought: this widget encodes a magnitude on brightness and a
 * heading on position, and a player using a screen reader gets neither. The
 * label states the two facts the marks state — where the evidence points and how
 * much of it there is — rather than describing the picture, which would be
 * useless to exactly the person who cannot see it.
 */
export function ariaLabel(b: BeliefState): string {
  if (b.observations.length === 0) return 'no charge movement observed yet';
  const marks = beliefMarks(b);
  const lead = marks[marks.length - 1]!;
  const dx = lead.x - 0.5;
  const dy = lead.y - 0.5;
  const compass = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  return `charge tends ${compass}; ${b.observations.length} observation` +
    `${b.observations.length === 1 ? '' : 's'}, ` +
    `agreement ${Math.round(b.coherence * 100)}%`;
}
