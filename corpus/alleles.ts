// corpus/alleles.ts — the gene pool, parsed out of the corpus's own prompts.
//
// WHAT THIS IS. The palette was measured from 1129 corpus images; the language
// of their prompts was counted last round. This reads a third thing that was
// there the whole time: 316 of the 1116 prompts are not prose but a COMBINATORIAL
// GRAMMAR, written as `{alternative|alternative|alternative}`.
//
// (`design/foundry-plan.md` says 311. That count required a `|` inside the
// braces and so missed the five arity-one loci; see `parsePrompt`. The plan's
// number is not corrected here by editing it into agreement — the two counts
// measure different things and the difference is exactly five.)
//
// That is a founding population for the breeding foundry, authored by whoever
// made the corpus and never recognised as one. `design/foundry-plan.md` records
// why it can found the EXPRESSION half of a genome and never the structural
// half: `neon cyan` is not a rule.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DIGEST BINDS THE INPUT AS WELL AS THE OUTPUT, AND THAT IS THE WHOLE POINT.
//
// The obvious design hashes the parsed pool and pins it, the way
// `design/corpus-manifest.json` pins the images. Run through the sovereignty
// classifier, that artifact is pinned IN TIME and has NO WITNESS: it proves the
// pool has not changed since it was written, and says nothing about whether the
// pool is CORRECT. A parser bug that mangled every allele in the same way would
// produce a perfectly stable digest for as long as the bug survived.
//
// So `poolDigest` hashes the concatenation of the RAW PROMPT BYTES and the
// PARSED OUTPUT. A corpus edit moves it with the parser unchanged; a parser
// change moves it with the corpus unchanged. Neither side can drift silently.
//
// And the witness is a ROUND TRIP: `expand` rebuilds the original prompt from
// the skeleton and the chosen alleles, and `verify-alleles` A3 requires it to
// reproduce the source string exactly, for every parsed prompt.
//
// THE ROUND TRIP IS ONLY A WITNESS IF IT CANNOT CHEAT. A parser that stored the
// prompt verbatim and "expanded" by handing it back would pass a round-trip
// check while proving nothing — the self-witness failure in a new costume. So
// the reconstruction is built ONLY from decomposed parts, and A3 also asserts
// that no skeleton segment contains a `{` or a `|`. A skeleton that still held
// the grammar would be a stored copy wearing a decomposition's clothes.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/**
 * One choice point in a prompt: a position, and the alternatives offered.
 *
 * TWO VIEWS OF THE SAME ALTERNATIVES, AND THE ROUND TRIP IS WHY.
 *
 * `alleles` is what a genome expresses: trimmed, so `neon cyan` is one allele
 * however the author spaced it. `raw` is what the corpus actually wrote. On
 * 1019 of 1026 loci they are identical; on **7** the author padded the pipes —
 * `{void black abyss | skeletal gold arches | ...}` — and the trim silently
 * dropped those spaces.
 *
 * That difference was not noticed by reading the corpus. It was found by the
 * A3 round trip failing on `mp9d4ebqw7edep`, which is the entire argument for
 * having a witness rather than a digest: a pool that trimmed and pinned itself
 * would have been perfectly stable and quietly lossy, and nothing in the system
 * would ever have said so. Keeping `raw` lets `expand` reproduce the source
 * byte for byte while `render` still expresses a clean allele.
 */
export interface Locus {
  /** Index of this locus within its prompt, left to right from 0. */
  readonly index: number;
  /** The alternatives, in source order, trimmed. What a genome expresses. */
  readonly alleles: readonly string[];
  /** The alternatives exactly as written, untrimmed. What `expand` replays. */
  readonly raw: readonly string[];
}

/**
 * One prompt, decomposed.
 *
 * `skeleton` has exactly `loci.length + 1` segments: the literal text before
 * the first locus, between each pair, and after the last. Interleaving the two
 * reproduces the source, which is what `expand` does and A3 checks.
 */
export interface ParsedPrompt {
  readonly id: string;
  readonly skeleton: readonly string[];
  readonly loci: readonly Locus[];
}

export interface AllelePool {
  /** Every prompt that carried a grammar, decomposed. */
  readonly prompts: readonly ParsedPrompt[];
  /** allele -> how many loci across the corpus offer it. The sampling prior. */
  readonly frequency: ReadonlyMap<string, number>;
  /** allele -> the prompt ids it appears in. Provenance, per allele. */
  readonly provenance: ReadonlyMap<string, readonly string[]>;
  readonly totalPrompts: number;
  readonly totalLoci: number;
}

/**
 * Splits one prompt into skeleton and loci.
 *
 * SINGLE-OPTION BRACES ARE LOCI, NOT LITERALS. Five prompts in the corpus carry
 * a `{...}` with no `|` inside. The tempting reading is that they are ordinary
 * text and the braces are noise. They are not: they occupy the same syntactic
 * position as every other locus, and treating them as literal text would mean
 * the pool silently disagreed with the corpus about how many choice points
 * exist. A locus of arity one is a locus whose allele is fixed.
 *
 * This is also the whole of the gap between this parser's count and the 311
 * quoted in `design/foundry-plan.md`: that measurement required a `|`, so it
 * missed exactly those five. **316**, not 311, and the five are the reason.
 *
 * Returns null when the prompt carries no braces at all — prose, not grammar.
 */
export function parsePrompt(id: string, source: string): ParsedPrompt | null {
  const skeleton: string[] = [];
  const loci: Locus[] = [];
  let cursor = 0;

  for (;;) {
    const open = source.indexOf('{', cursor);
    if (open < 0) break;
    const close = source.indexOf('}', open);
    // An unbalanced brace is not silently swallowed. The corpus has none —
    // measured, 0 of 1116 — but a parser that dropped the rest of a prompt on
    // one bad character would make the pool look cleaner than the corpus is.
    if (close < 0) throw new Error(`alleles: unbalanced brace in ${id} at ${open}`);

    skeleton.push(source.slice(cursor, open));
    const raw = source.slice(open + 1, close).split('|');
    loci.push({
      index: loci.length,
      alleles: raw.map((a) => a.trim()),
      raw,
    });
    cursor = close + 1;
  }

  if (loci.length === 0) return null;
  skeleton.push(source.slice(cursor));
  return { id, skeleton, loci };
}

/**
 * Rebuilds the SOURCE form of a prompt from its parts. THE WITNESS.
 *
 * It re-emits the grammar — `{a|b|c}` — rather than a choice, and A3 requires
 * the result to equal the source prompt character for character, for all 311.
 * It is the only thing standing between this pool and a plausible-looking
 * mangling.
 *
 * Note what it does NOT have access to: the source string. It can only
 * interleave skeleton and alleles, so agreement with the source is evidence
 * rather than tautology. It takes no `choice` for the same reason — a witness
 * that needed to be told the answer would not be one.
 */
export function expand(parsed: ParsedPrompt): string {
  let out = '';
  for (let i = 0; i < parsed.loci.length; i += 1) {
    out += parsed.skeleton[i]! + '{' + parsed.loci[i]!.raw.join('|') + '}';
  }
  return out + parsed.skeleton[parsed.loci.length]!;
}

/** The chosen form: one allele per locus, no grammar left. What a genome expresses. */
export function render(parsed: ParsedPrompt, choice: readonly number[]): string {
  let out = '';
  for (let i = 0; i < parsed.loci.length; i += 1) {
    const locus = parsed.loci[i]!;
    const pick = locus.alleles[choice[i] ?? 0];
    if (pick === undefined) throw new Error(`alleles: no allele ${choice[i]} at locus ${i} of ${parsed.id}`);
    out += parsed.skeleton[i]! + pick;
  }
  return out + parsed.skeleton[parsed.loci.length]!;
}

/** Builds the pool from `id -> prompt` pairs. Pure: same input, same pool. */
export function buildPool(sources: ReadonlyMap<string, string>): AllelePool {
  const prompts: ParsedPrompt[] = [];
  const frequency = new Map<string, number>();
  const provenance = new Map<string, string[]>();

  // Sorted, so the pool and its digest do not depend on directory order.
  for (const id of [...sources.keys()].sort()) {
    const parsed = parsePrompt(id, sources.get(id)!);
    if (!parsed) continue;
    prompts.push(parsed);
    for (const locus of parsed.loci) {
      for (const allele of locus.alleles) {
        frequency.set(allele, (frequency.get(allele) ?? 0) + 1);
        const seen = provenance.get(allele) ?? [];
        if (!seen.includes(parsed.id)) seen.push(parsed.id);
        provenance.set(allele, seen);
      }
    }
  }

  return {
    prompts,
    frequency,
    provenance,
    totalPrompts: prompts.length,
    totalLoci: prompts.reduce((n, p) => n + p.loci.length, 0),
  };
}

/**
 * A hash over the RAW corpus prompts — every one of them, grammar or prose.
 *
 * Split out from `poolDigest` so the pinned artifact can carry it as a scalar
 * and still be self-verifying: `verify-alleles` recomputes the pool digest
 * from the artifact alone, and recomputes THIS from the corpus when the corpus
 * is on disk — the same split `verify-theme` T5 makes between checking the
 * links and reproducing the measurement.
 *
 * It covers the PROSE prompts too. A corpus edit that turns prose into a
 * grammar, or deletes a grammar outright, must not be able to present itself as
 * "no change to the pool".
 */
export function sourcesRoot(sources: ReadonlyMap<string, string>): string {
  const h = createHash('sha256');
  h.update('glaas-allele-sources-v1\n');
  // \u0000 as the separator, not a space: a prompt can contain a space, so a
  // space-separated hash could be fooled by moving a character across a field
  // boundary. No prompt in the corpus contains a NUL — measured, and asserted
  // by verify-alleles A1.
  for (const id of [...sources.keys()].sort()) h.update(`${id}\u0000${sources.get(id)!}\u0000`);
  return h.digest('hex');
}

/**
 * The digest, over BOTH the raw input and the parsed output.
 *
 * See the header. Hashing the pool alone would pin it in time with no witness:
 * a consistently wrong parser produces a consistently stable digest for as long
 * as the bug lives. Feeding in `root` binds the source bytes, so a parser
 * change moves the digest with the corpus byte-identical, and a corpus change
 * moves it with the parser byte-identical. A4 plants a mutant against each half
 * and requires both to be caught.
 */
export function poolDigest(root: string, pool: AllelePool): string {
  const h = createHash('sha256');
  h.update('glaas-allele-pool-v1\n');
  h.update(`--- input ---\n${root}\n`);
  h.update('--- output ---\n');
  for (const p of pool.prompts) {
    h.update(`${p.id}\u0000${p.skeleton.join('\u0000')}\u0000`);
    // BOTH views. Binding only `alleles` would let the padding on those seven
    // loci change without moving the digest, and that padding is the difference
    // between a pool that replays the corpus and one that approximates it.
    for (const locus of p.loci) {
      h.update(`${locus.index}\u0000${locus.alleles.join('\u0000')}\u0000`);
      h.update(`${locus.raw.join('\u0000')}\u0000`);
    }
  }
  return h.digest('hex');
}
