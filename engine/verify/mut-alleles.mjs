// Tier 1, curated: break corpus/alleles.ts on purpose, require verify-alleles
// to notice. Each mutation has a stated behavioural consequence, so equivalence
// is settled by construction rather than assumed.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SUBJECT = `${ROOT}/corpus/alleles.ts`;
const BACKUP = `${tmpdir()}/alleles.ts.orig`;

copyFileSync(SUBJECT, BACKUP);
const original = readFileSync(SUBJECT, 'utf8');

const MUTANTS = [
  {
    name: 'M1 expand replays the trimmed alleles, not what the corpus wrote',
    why: 'the exact bug A3 found on the first run: 7 padded loci silently normalised',
    from: "parsed.loci[i]!.raw.join('|')",
    to: "parsed.loci[i]!.alleles.join('|')",
  },
  {
    name: 'M2 single-option braces are treated as literal text',
    why: 'the pool would disagree with the corpus about how many choice points exist',
    from: '    const raw = source.slice(open + 1, close).split(\'|\');',
    to:
      "    const raw = source.slice(open + 1, close).split('|');\n" +
      '    if (raw.length === 1) { skeleton[skeleton.length - 1] += `{${raw[0]}}`; cursor = close + 1; continue; }',
  },
  {
    name: 'M3 the trim is dropped, so alleles carry the padding',
    why: '`neon cyan` and ` neon cyan ` become different alleles',
    from: 'alleles: raw.map((a) => a.trim()),',
    to: 'alleles: raw.slice(),',
  },
  {
    name: 'M4 the digest ignores the corpus half',
    why: 'a corrupted prompt would no longer move the pool digest',
    from: 'h.update(`--- input ---\\n${root}\\n`);',
    to: "h.update('--- input ---\\n');",
  },
  {
    name: 'M5 the digest ignores the raw view',
    why: 'padding could change without moving the digest',
    from: "      h.update(`${locus.raw.join('\\u0000')}\\u0000`);\n",
    to: '',
  },
  {
    name: 'M6 an unbalanced brace is swallowed instead of thrown',
    why: 'a malformed prompt would silently lose its tail and the pool would look cleaner than the corpus',
    from: 'if (close < 0) throw new Error(`alleles: unbalanced brace in ${id} at ${open}`);',
    to: 'if (close < 0) break;',
  },
];

let survived = 0;
for (const m of MUTANTS) {
  if (!original.includes(m.from)) {
    console.log(`ANCHOR MISS  ${m.name}`);
    survived += 1;
    continue;
  }
  writeFileSync(SUBJECT, original.replace(m.from, m.to));
  let caught = false;
  let firstFailure = '';
  try {
    execFileSync('npx', ['tsx', 'engine/verify/verify-alleles.ts'], {
      cwd: ROOT, env: { ...process.env, GLAAS_CORPUS_DIR: process.env.HIDE_CORPUS ? '/nonexistent' : (process.env.GLAAS_CORPUS_DIR ?? '/home/user/libriopal/magentadice-cyancode/data') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    caught = true;
    firstFailure = String(err.stderr ?? '')
      .split('\n')
      .find((l) => /^\s{2}A\d/.test(l))
      ?.trim() ?? String(err.stderr ?? '').split('\n')[0]?.trim() ?? '';
  }
  copyFileSync(BACKUP, SUBJECT);
  if (caught) console.log(`CAUGHT    ${m.name}\n            by: ${firstFailure}`);
  else {
    survived += 1;
    console.log(`SURVIVED  ${m.name}\n            (${m.why})`);
  }
}

copyFileSync(BACKUP, SUBJECT);
console.log(`\ncurated: ${MUTANTS.length - survived}/${MUTANTS.length} caught`);
process.exit(survived === 0 ? 0 : 1);
