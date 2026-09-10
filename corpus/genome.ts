// corpus/genome.ts — a genome is a choice at every locus the corpus wrote.
//
// Stage 0 pinned the gene pool: 316 prompts, 1031 loci, 584 alleles. This is
// the thing that reads it as a GENOTYPE — one allele index per locus — and
// expresses it as the phenotype `families/expression/pipeline.ts` was written to
// consume but has never been given.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE POOL IS ALMOST ENTIRELY BINARY, AND THAT IS THE STRUCTURAL FACT OF IT.
//
// Locus arity across the 1031 loci, measured:
//
//     arity 2  842   (81.7%)      arity 5    3
//     arity 3  170                arity 6    2
//     arity 1    5                arity 7    7
//     arity 4    2
//
// Four fifths of the corpus's choice points are a coin flip. A genome over this
// pool is therefore very close to a BIT STRING of length 1031, which is not a
// curiosity — it is what makes crossover and point mutation well-defined
// operations in Stage 5 rather than things that have to be invented. Nobody had
// written that down; `design/foundry-plan.md` treated the pool as a bag of
// strings.
//
// The encoding keeps the general case honest anyway: a genome is an array of
// indices, one per locus, each reduced modulo that locus's real arity. A genome
// cannot address an allele that does not exist, and `verify-expression-pool` X4
// checks that against the pool rather than trusting this paragraph.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PLAN'S GATE FOR THIS STAGE IS VACUOUS AS WRITTEN, AND SAYING SO IS THE
// POINT OF WRITING IT DOWN.
//
// `design/foundry-plan.md` says: *"expression must be a pure function of the
// genome — same genome, same screen, provable by digest."* Purity is necessary
// and it is nowhere near sufficient, because **a constant function is pure**.
// An expression pipeline that ignored the genome entirely and returned the same
// phenotype every time would satisfy that gate perfectly, and the existing
// `families/expression/verify-expression.ts` would not notice — it proves
// determinism against a corpus of two hand-written fixtures (`'sentinel'`,
// `'ember'`, `'quarry'`), so it measures that the code is deterministic and
// never that the expression carries the corpus.
//
// So the gate here is purity AND SENSITIVITY: every locus must be ABLE to move
// the phenotype, measured by flipping loci one at a time. X3 plants
// `constantExpression` — pure, genome-blind — and requires it to pass the
// plan's gate and fail this one. If it does not, the plan's gate was the whole
// check and this stage proved nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

/** One allele index per locus, in the pool's own prompt-then-locus order. */
export type Genome = readonly number[];

/** A locus as the genome addresses it: where it came from, and its choices. */
export interface PoolLocus {
  /** The prompt this locus belongs to. Provenance, per gene. */
  readonly promptId: string;
  /** Index within that prompt. */
  readonly index: number;
  readonly alleles: readonly string[];
}

/** The pinned pool, flattened into the ordered locus list a genome indexes. */
export interface FlatPool {
  readonly loci: readonly PoolLocus[];
  /** allele -> how many loci offer it. The sampling prior. */
  readonly frequency: ReadonlyMap<string, number>;
  readonly digest: string;
}

interface ArtifactShape {
  digest: string;
  prompts: { id: string; loci: { alleles: string[]; raw: string[] }[] }[];
  frequency: Record<string, number>;
}

/** Flattens the pinned artifact into the ordered locus list. */
export function flatten(artifact: ArtifactShape): FlatPool {
  const loci: PoolLocus[] = [];
  for (const p of artifact.prompts) {
    for (const [index, l] of p.loci.entries()) {
      loci.push({ promptId: p.id, index, alleles: l.alleles });
    }
  }
  return {
    loci,
    frequency: new Map(Object.entries(artifact.frequency)),
    digest: artifact.digest,
  };
}

/**
 * The allele a genome selects at one locus.
 *
 * Modulo the locus's REAL arity, so an out-of-range or negative index folds
 * back onto a real allele instead of producing `undefined`. A genome is a thing
 * a mutation operator will scribble on; it should not be possible to scribble
 * it into a crash.
 */
export function alleleAt(pool: FlatPool, genome: Genome, locus: number): string {
  const l = pool.loci[locus];
  if (!l) throw new Error(`genome: no locus ${locus} in a pool of ${pool.loci.length}`);
  const n = l.alleles.length;
  const raw = genome[locus] ?? 0;
  return l.alleles[((raw % n) + n) % n]!;
}

/**
 * A genome from a seed, sampled by the corpus's own frequencies.
 *
 * NOT UNIFORM, AND THE DIFFERENCE MATTERS. `neon cyan` appears at 45 loci and
 * some allele appears at one; sampling uniformly would throw away the only
 * curation signal the corpus contains. The ratings are all zero — measured in
 * Stage 0 — so frequency is the entire prior, and discarding it would leave the
 * founding population with no prior at all.
 */
export function seededGenome(pool: FlatPool, seed: string): Genome {
  const out: number[] = [];
  let counter = 0;
  let buf = Buffer.alloc(0);
  let cursor = 0;
  const byte = (): number => {
    if (cursor >= buf.length) {
      buf = createHash('sha256').update(`glaas-genome-v1\u0000${seed}\u0000${counter}`).digest();
      counter += 1;
      cursor = 0;
    }
    return buf[cursor++]!;
  };

  for (const l of pool.loci) {
    const weights = l.alleles.map((a) => pool.frequency.get(a) ?? 1);
    const total = weights.reduce((s, w) => s + w, 0);
    // Two bytes, so a locus of arity 7 is not visibly biased by a 256-way fold.
    let pick = ((byte() << 8) | byte()) % total;
    let chosen = 0;
    for (let i = 0; i < weights.length; i += 1) {
      pick -= weights[i]!;
      if (pick < 0) { chosen = i; break; }
    }
    out.push(chosen);
  }
  return out;
}

/**
 * The phenotype: what a genome puts on the screen.
 *
 * Every field is a STRING THE CORPUS WROTE, never a string this file invented.
 * X5 checks that against the pinned pool allele by allele — the moment
 * expression starts generating vocabulary of its own, the claim that the game
 * is grown from the corpus stops being true and starts being a story about the
 * corpus.
 */
export interface Phenotype {
  /** Alleles carrying a colour word, in pool order. Drives the palette. */
  readonly palette: readonly string[];
  /** The rest, in pool order. Drives motifs, naming and the narrative frame. */
  readonly motifs: readonly string[];
  /** Every allele the genome selected, deduplicated, in pool order. */
  readonly selected: readonly string[];
}

/**
 * The colour words the corpus actually uses.
 *
 * MEASURED, NOT LISTED FROM TASTE. Each of these appears in the pool's allele
 * text; together they cover **171 of 584 alleles (29.3%)**. The other 70.7% do
 * not name a colour and cannot drive a palette, which is a limit of the corpus
 * and is declared here rather than papered over: X6 pins the coverage so a
 * future change that quietly widened the list to make the palette look richer
 * would move a number somebody has to defend.
 */
export const COLOUR_WORDS: readonly string[] = [
  'amber', 'black', 'blue', 'crimson', 'cryo', 'cyan', 'electric', 'gold', 'green',
  'ice', 'magenta', 'neon', 'obsidian', 'prismatic', 'purple', 'rainbow', 'red',
  'silver', 'steel', 'violet', 'void', 'white',
];

const carriesColour = (allele: string): boolean => {
  const lower = allele.toLowerCase();
  return COLOUR_WORDS.some((c) => lower.includes(c));
};

/** Expresses a genome. Pure: same pool, same genome, same phenotype. */
export function express(pool: FlatPool, genome: Genome): Phenotype {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (let i = 0; i < pool.loci.length; i += 1) {
    const allele = alleleAt(pool, genome, i);
    if (!seen.has(allele)) { seen.add(allele); selected.push(allele); }
  }
  return {
    palette: selected.filter(carriesColour),
    motifs: selected.filter((a) => !carriesColour(a)),
    selected,
  };
}

/** A digest over the phenotype. The plan's "provable by digest". */
export function phenotypeDigest(p: Phenotype): string {
  return createHash('sha256')
    .update('glaas-phenotype-v1\n')
    .update(p.selected.join('\u0000'))
    .digest('hex');
}

/**
 * A pure, genome-blind expression. THE PLANNED GATE'S NEGATIVE CONTROL.
 *
 * It satisfies "same genome, same screen, provable by digest" perfectly and
 * carries no information about the genome whatsoever. It exists so that
 * `verify-expression-pool` X3 can demonstrate the plan's gate passing on it,
 * which is the only way to show that the gate needed replacing rather than
 * merely asserting it in a comment.
 */
export function constantExpression(pool: FlatPool, _genome: Genome): Phenotype {
  const selected = pool.loci.map((l) => l.alleles[0]!);
  const seen = new Set<string>();
  const unique = selected.filter((a) => (seen.has(a) ? false : (seen.add(a), true)));
  return {
    palette: unique.filter(carriesColour),
    motifs: unique.filter((a) => !carriesColour(a)),
    selected: unique,
  };
}
