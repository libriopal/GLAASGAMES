// lattice/ruleset.ts — binding the round to the RULES it was played under.
//
// THE HOLE THIS CLOSES.
//
// `commit.ts` publishes H = sha256(serverSeed) before a round and reveals the
// seed after it. That constrains the operator's choice of seed and nothing else.
// It says nothing whatsoever about the FUNCTION the seed is fed into.
//
// So this attack survives the entire existing scheme, and it survives replay
// verification too:
//
//   The operator ships player A a build where FACE_WEIGHTS is [0,4,4,4,4,4,4]
//   and player B a build where it is [0,4,4,4,4,4,5]. Both players receive an
//   honest commitment. Both receive an honest reveal. Both run `verifyRound`
//   against their own copy of the rules and both get `ok: true`, because each
//   is checking the seed against the rules they were given. Two players sat at
//   the same shared board have just verified two different games and neither
//   check can see it. Every existing oracle passes.
//
// Commit-reveal pins the seed IN TIME. Replay pins the trajectory AGAINST A
// WITNESS — the verifier's own executor. The rules are pinned by neither, and
// that is the whole defect: they are an assertion, and an assertion made by the
// party it is supposed to constrain.
//
// THE FIX, AND WHY IT IS THIS SHAPE.
//
// A rules hash is computed from the SOURCE THAT ACTUALLY EXECUTES, published
// alongside the seed commitment before the round, and recomputed independently
// by anyone holding the code. That makes it pinned in both senses at once: it
// existed before the player acted, and it is checkable against a second copy
// the operator does not control.
//
// A hash the operator merely REPORTS is worth nothing — it is the assertion
// again with a hex string in front of it. The value is entirely in (a) having
// been published first and (b) two parties computing it separately and
// comparing. `sameRules` is therefore the function that matters here, and it
// takes two independently-computed hashes rather than a claim.
//
// WHY THE HASH IS SEMANTIC AND NOT A BYTE HASH.
//
// `frame.ts` deliberately leaves rendering out of its stamp, because two
// clients may legitimately draw at different resolutions and hashing pixels
// would turn a legal difference into a false desync — and a desync alarm that
// cries wolf is an alarm that gets ignored. The same argument applies exactly
// here. Two builds whose only difference is a reworded comment play an
// identical game; a raw byte hash would call them different rulesets and the
// mismatch warning would be trained out of everyone within a week.
//
// So comments and whitespace are stripped before hashing and only the semantic
// text is bound. `verify-ruleset` proves both halves of that: a comment-only
// edit must NOT move the hash, and a one-character change to a rule constant
// MUST move it. An oracle that only ever passes is not an oracle, and the
// second of those is this file's negative control.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every file whose content can change a round's outcome, in a fixed order.
 *
 * The order is part of the hash. Adding a file that influences outcomes and
 * forgetting to list it here is the way this mechanism fails silently, so
 * `verify-ruleset` cross-checks the list against what `round.ts` actually
 * imports rather than trusting that it was maintained.
 */
export const RULE_SOURCES: readonly string[] = [
  'lattice/board.ts',
  'lattice/lattice-gen.ts',
  'lattice/round.ts',
  'lattice/commit.ts',
  'lattice/bond.ts',
  'engine/sim/world-gen.ts',
  'engine/sim/hash.ts',
];

/**
 * Strips what cannot change behaviour: line comments, block comments, and
 * runs of whitespace.
 *
 * This is deliberately conservative rather than a parser. It can only ever
 * remove characters, so the failure mode is a hash that moves when it did not
 * strictly need to — a false mismatch, which is loud and gets investigated.
 * The dangerous failure would be the opposite: normalising away something that
 * DOES change behaviour, producing two builds that play differently under one
 * hash. Nothing here can do that, because nothing here rewrites a token.
 */
export function semanticText(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  let inString: string | null = null;

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];

    if (inString !== null) {
      out += c;
      if (c === '\\') {
        // Escape: consume the escaped character verbatim so a backslash before
        // a quote cannot be mistaken for the end of the string.
        if (i + 1 < n) out += source[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      // Collapse to a single space. Whitespace between tokens is not zero —
      // `const x` is not `constx` — so it is reduced, never deleted.
      if (out.length > 0 && out[out.length - 1] !== ' ') out += ' ';
      i += 1;
      continue;
    }

    out += c;
    i += 1;
  }
  return out.trim();
}

function sourcePath(relative: string): string {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

/** SHA-256 hex over one string. */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface RulesDigest {
  /** The hash the commitment carries. */
  readonly hash: string;
  /** Per-file hashes, so a mismatch names the file rather than only existing. */
  readonly files: Readonly<Record<string, string>>;
}

/**
 * Computes the rules hash from the source on this machine.
 *
 * Each file is bound with its PATH and its SEMANTIC LENGTH as well as its text.
 * Without the length, two adjacent files could in principle be re-split at a
 * different boundary and hash the same; the length makes the concatenation
 * unambiguous. Without the path, a file could be swapped for another in the
 * list and go unnoticed.
 */
export function computeRules(): RulesDigest {
  const files: Record<string, string> = {};
  const parts: string[] = [];
  for (const relative of RULE_SOURCES) {
    const semantic = semanticText(readFileSync(sourcePath(relative), 'utf8'));
    files[relative] = sha256(semantic);
    parts.push(`${relative}:${semantic.length}:${files[relative]}`);
  }
  return { hash: sha256(parts.join('\n')), files: Object.freeze(files) };
}

/**
 * Do two independently-computed digests describe the same game?
 *
 * Returns the files that differ, not merely a boolean, for the same reason
 * `compareFrames` names the subsystem: "we are playing different games" points
 * at the whole program, where "we disagree about round.ts" points at one file.
 */
export function sameRules(
  mine: RulesDigest,
  theirs: RulesDigest,
): { readonly agree: boolean; readonly differing: readonly string[] } {
  const differing = RULE_SOURCES.filter((f) => mine.files[f] !== theirs.files[f]);
  return { agree: mine.hash === theirs.hash && differing.length === 0, differing };
}
