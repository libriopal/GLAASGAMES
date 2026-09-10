// Tier 1, curated: break corpus/genome.ts on purpose, require
// verify-expression-pool to notice. Each mutation is a way expression could
// quietly stop carrying the corpus while every previous check stayed green.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SUBJECT = `${ROOT}/corpus/genome.ts`;
const BACKUP = `${tmpdir()}/genome.ts.orig`;
copyFileSync(SUBJECT, BACKUP);
const original = readFileSync(SUBJECT, 'utf8');

const MUTANTS = [
  {
    name: 'M1 expression ignores the genome (the plan gate passes, this must not)',
    why: 'the exact vacuity X3 demonstrates — pure, deterministic, and carrying nothing',
    from: '    const allele = alleleAt(pool, genome, i);',
    to: '    const allele = pool.loci[i]!.alleles[0]!;',
  },
  {
    name: 'M2 the phenotype becomes an unordered set',
    why: 'sorting discards order-of-first-appearance, the thing carrying 259 loci',
    from: ".update(p.selected.join(",
    to: ".update([...p.selected].sort().join(",
  },
  {
    name: 'M3 sampling ignores the corpus frequencies',
    why: 'throws away the only curation signal the corpus has; ratings are all zero',
    from: '    const weights = l.alleles.map((a) => pool.frequency.get(a) ?? 1);',
    to: '    const weights = l.alleles.map(() => 1);',
  },
  {
    name: 'M4 a hostile genome index escapes its locus',
    why: 'a mutation operator could then produce an allele the corpus never wrote',
    from: '  return l.alleles[((raw % n) + n) % n]!;',
    to: '  return l.alleles[Math.abs(raw) % (n + 1)] ?? l.alleles[0]!;',
  },
  {
    name: 'M5 the palette split silently drops alleles',
    why: 'genes vanish between genotype and screen while every digest stays stable',
    from: '    motifs: selected.filter((a) => !carriesColour(a)),\n    selected,',
    to: '    motifs: selected.filter((a) => !carriesColour(a)).slice(0, 10),\n    selected,',
  },
  {
    name: 'M6 the colour word list is widened to flatter the palette',
    why: 'makes the corpus look more colourful than it measured',
    from: "  'silver', 'steel', 'violet', 'void', 'white',",
    to: "  'silver', 'steel', 'violet', 'void', 'white', 'a', 'e', 'i',",
  },
];

let survived = 0;
for (const m of MUTANTS) {
  if (!original.includes(m.from)) { console.log(`ANCHOR MISS  ${m.name}`); survived += 1; continue; }
  writeFileSync(SUBJECT, original.replace(m.from, m.to));
  let caught = false, first = '';
  try {
    execFileSync('npx', ['tsx', 'engine/verify/verify-expression-pool.ts'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    caught = true;
    const lines = String(err.stderr ?? '').split('\n');
    first = lines.find((l) => /^\s{2}X\d/.test(l))?.trim() ?? lines[0]?.trim() ?? '';
  }
  copyFileSync(BACKUP, SUBJECT);
  if (caught) console.log(`CAUGHT    ${m.name}\n            by: ${first.slice(0, 130)}`);
  else { survived += 1; console.log(`SURVIVED  ${m.name}\n            (${m.why})`); }
}
copyFileSync(BACKUP, SUBJECT);
console.log(`\ncurated: ${MUTANTS.length - survived}/${MUTANTS.length} caught`);
process.exit(survived === 0 ? 0 : 1);
