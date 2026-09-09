// engine/verify/mutate.ts — breaking the code on purpose, to see if anyone notices.
//
// WHY THIS EXISTS.
//
// This project's central epistemic rule is that an oracle is not accepted until
// it has been SEEN TO FAIL on a build with the feature removed. Every verify
// file in the repo repeats some version of it: "an oracle that has only ever
// been seen to pass is decoration."
//
// The rule was enforced by nothing. It was a convention, held up by whoever
// last read it, and the only project-wide evidence for it was the phrase
// "NEGATIVE CONTROL" appearing in source comments — which measures vocabulary,
// not the property.
//
// THE INCIDENT THAT PROVES THE GAP IS REAL, and it happened in this repo:
// `verify-ruleset.ts` shipped its first draft with two controls that perturbed
// "the first digit in the file". In both files that digit sat inside a code
// comment, which the system under test correctly strips before hashing. The
// raw text changed, the setup guard asserted the raw text changed, and the
// control tested nothing — while containing the literal words NEGATIVE CONTROL
// and reading, to a human and to a grep, exactly like a working one. Running
// it is what caught it. Nothing else could have.
//
// So: mutate the subject, run the oracle, require a non-zero exit. That is the
// only instrument that measures the property rather than its description.
//
// THE HONEST LIMITATION, STATED UP FRONT.
//
// Mutation testing's known failure is the EQUIVALENT MUTANT: a perturbation
// that changes the source without changing observable behaviour. `i <= n-1`
// becomes `i < n`; a constant is altered on a path no input reaches. An oracle
// that "survives" such a mutant has done nothing wrong, and a harness that
// failed the build on it would generate false accusations until it was
// switched off — the same death every over-eager alarm in this repo is
// designed to avoid (see frame.ts on why rendering is outside the stamp).
//
// This harness therefore refuses to pretend generated mutants are proof. It
// has two tiers and they carry different authority:
//
//   TIER 1  CURATED. Hand-written mutations with a stated behavioural
//           consequence — a loaded die, a widened board, an inverted guard.
//           Equivalence is settled by construction because a human wrote down
//           what the mutation does. Surviving one is a BUILD FAILURE.
//
//   TIER 2  GENERATED. Mechanical constant and operator flips over code spans.
//           Equivalence is undecidable in general, so survivors are REPORTED
//           with a score and never fail the build on their own.
//
// Tier 1 is the gate. Tier 2 is the search that finds candidates for Tier 1.
// Conflating them would buy a bigger number at the cost of the alarm's
// credibility, which is the only thing that makes an alarm useful.

import { codeSpans } from '../../lattice/ruleset.js';

export interface Mutation {
  /** Where in the source, and what it becomes. */
  readonly offset: number;
  readonly length: number;
  readonly replacement: string;
  /** The original text, for reporting. */
  readonly original: string;
  readonly operator: string;
}

/** Applies one mutation to a source string. */
export function applyMutation(source: string, m: Mutation): string {
  return source.slice(0, m.offset) + m.replacement + source.slice(m.offset + m.length);
}

/**
 * Operators, chosen for behavioural bite rather than count.
 *
 * Deliberately EXCLUDED: `i < n` -> `i <= n` on loop bounds, which is the
 * single richest source of equivalent and crash-only mutants and would swamp
 * the report with noise. Off-by-one loop errors are already covered by the
 * boundary sweeps in verify-fixed and verify-sim, which test them directly
 * rather than inferring them from a survivor count.
 */
const OPERATORS: readonly { readonly name: string; readonly pattern: RegExp; readonly mutate: (t: string) => string | null }[] = [
  {
    name: 'const:increment',
    pattern: /(?<![\w.])\d+(?![\w.])/g,
    mutate: (t) => {
      const v = Number.parseInt(t, 10);
      if (!Number.isFinite(v)) return null;
      return String(v + 1);
    },
  },
  { name: 'cmp:gte->gt', pattern: />=/g, mutate: () => '>' },
  { name: 'cmp:lte->lt', pattern: /<=/g, mutate: () => '<' },
  { name: 'eq:strict->negated', pattern: /===/g, mutate: () => '!==' },
  { name: 'bool:true->false', pattern: /(?<![\w.])true(?![\w.])/g, mutate: () => 'false' },
  { name: 'bool:false->true', pattern: /(?<![\w.])false(?![\w.])/g, mutate: () => 'true' },
];

/**
 * Every candidate mutation in a file, restricted to executable text.
 *
 * String literals are excluded as well as comments. A mutated string usually
 * changes only a message, and a harness that counted "the failure text now
 * reads differently" as a caught mutant would inflate its own score with
 * findings that mean nothing.
 */
export function candidates(source: string): readonly Mutation[] {
  const spans = codeSpans(source).filter((s) => !s.isString);
  const found: Mutation[] = [];
  for (const span of spans) {
    const text = source.slice(span.start, span.end);
    for (const op of OPERATORS) {
      op.pattern.lastIndex = 0;
      for (const match of text.matchAll(op.pattern)) {
        const replacement = op.mutate(match[0]);
        if (replacement === null || replacement === match[0]) continue;
        found.push({
          offset: span.start + match.index,
          length: match[0].length,
          replacement,
          original: match[0],
          operator: op.name,
        });
      }
    }
  }
  return found.sort((a, b) => a.offset - b.offset);
}

/**
 * A deterministic sample of candidates.
 *
 * DETERMINISTIC BECAUSE EVERYTHING HERE IS. A harness that sampled randomly
 * would report a different mutation score on every run, and a number that moves
 * on its own is a number nobody can act on — the same reason the simulation
 * uses a seeded integer RNG rather than Math.random. Same seed, same mutants,
 * same score, so a change in the score means a change in the code.
 */
export function sample(all: readonly Mutation[], count: number, seed: number): readonly Mutation[] {
  if (all.length <= count) return all;
  const picked: Mutation[] = [];
  const taken = new Set<number>();
  let state = seed >>> 0 || 0x9e3779b9;
  while (picked.length < count) {
    state = (Math.imul(state, 0x01000193) ^ 0x811c9dc5) >>> 0;
    const index = state % all.length;
    if (taken.has(index)) continue;
    taken.add(index);
    picked.push(all[index]!);
  }
  return picked.sort((a, b) => a.offset - b.offset);
}
