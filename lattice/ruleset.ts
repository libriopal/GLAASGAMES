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

/** A half-open [start, end) range of the source that is executable text. */
export interface CodeSpan {
  readonly start: number;
  readonly end: number;
  /** True when the span is the inside of a string literal, quotes excluded. */
  readonly isString: boolean;
}

/**
 * Splits a source file into the regions that are executable and the regions
 * that are not, without parsing it.
 *
 * Deliberately conservative: it can only ever classify code AS comment by
 * mistake in ways that make the hash move more often, never less. The
 * dangerous direction — treating something behaviour-bearing as inert — would
 * let two builds play differently under one hash, and nothing here can do that
 * because nothing here rewrites a token.
 *
 * Shared with the mutation harness in `engine/verify/mutate.ts`, which needs
 * exactly the same distinction for the opposite reason: a mutation planted in
 * a comment tests nothing, and a negative control that perturbs a comment while
 * announcing itself as a negative control is how this project's own oracle was
 * briefly vacuous. One scanner, so the hash and the mutator can never disagree
 * about what counts as code.
 */
export function codeSpans(source: string): readonly CodeSpan[] {
  const spans: CodeSpan[] = [];
  const n = source.length;
  let i = 0;
  let spanStart = 0;

  const close = (end: number, isString = false): void => {
    if (end > spanStart) spans.push({ start: spanStart, end, isString });
  };

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];

    if (c === '"' || c === "'" || c === '`') {
      close(i);
      const quote = c;
      const literalStart = i;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) break;
        i += 1;
      }
      i += 1;
      // The QUOTES ARE PART OF THE SPAN. Excluding them would make the literal
      // 'x' and the identifier x hash identically, which is a collision
      // between two different programs and exactly what this file exists to
      // prevent.
      spans.push({ start: literalStart, end: Math.min(i, n), isString: true });
      spanStart = i;
      continue;
    }

    if (c === '/' && next === '/') {
      close(i);
      while (i < n && source[i] !== '\n') i += 1;
      spanStart = i;
      continue;
    }

    if (c === '/' && next === '*') {
      close(i);
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      spanStart = i;
      continue;
    }

    i += 1;
  }
  close(n);
  return spans;
}

/**
 * Strips what cannot change behaviour: line comments, block comments, and
 * runs of whitespace. Built on `codeSpans` so the rules hash and the mutation
 * harness share one definition of "code".
 */
export function semanticText(source: string): string {
  let out = '';
  for (const span of codeSpans(source)) {
    const text = source.slice(span.start, span.end);
    if (span.isString) {
      // String contents are behaviour. Preserved verbatim, whitespace included.
      out += text;
      continue;
    }
    for (const ch of text) {
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        // Collapse to a single space. Whitespace between tokens is not zero —
        // `const x` is not `constx` — so it is reduced, never deleted.
        if (out.length > 0 && out[out.length - 1] !== ' ') out += ' ';
      } else {
        out += ch;
      }
    }
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
