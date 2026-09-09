// Tier 1, curated: break web/tokens.ts on purpose, require verify-tokens to
// notice. Each mutation is a design decision this stage actually considered and
// rejected, so equivalence is settled by construction rather than assumed.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// Most mutants break the token module. M8 breaks the WIRING instead, which is
// the only way to exercise P9: a token module that draws a perfect 3 on a cell
// the model says is a 5 is not a broken token module.
const SUBJECTS = {
  tokens: `${ROOT}/web/tokens.ts`,
  app: `${ROOT}/web/lattice-app.ts`,
};
const BACKUPS = {
  tokens: `${tmpdir()}/tokens.ts.orig`,
  app: `${tmpdir()}/lattice-app.ts.orig`,
};
for (const k of Object.keys(SUBJECTS)) copyFileSync(SUBJECTS[k], BACKUPS[k]);
const ORIGINALS = Object.fromEntries(
  Object.entries(SUBJECTS).map(([k, f]) => [k, readFileSync(f, 'utf8')]),
);

const MUTANTS = [
  {
    name: 'M1 the faces become emblems instead of pips',
    why: 'the design this stage rejected — an identity system where the game needs a magnitude one',
    from: '  1: [{ x: MID, y: MID }],',
    to: '  1: [{ x: MID, y: MID }, { x: LO, y: HI }],',
  },
  {
    name: 'M2 a 3 is drawn as a row instead of the canonical diagonal',
    why: 'still three pips, still countable — but the gestalt channel a human reads is gone',
    from: '  3: [{ x: LO, y: LO }, { x: MID, y: MID }, { x: HI, y: HI }],',
    to: '  3: [{ x: LO, y: MID }, { x: MID, y: MID }, { x: HI, y: MID }],',
  },
  {
    name: 'M3 the pips are fattened until they touch',
    why: 'segmentation failure — the auditor’s first objection, planted',
    from: 'export const PIP_R = 0.085;',
    to: 'export const PIP_R = 0.125;',
  },
  {
    name: 'M4 the pip ink drops toward the token ground',
    why: 'geometrically perfect, perceptually gone — the auditor’s second objection, planted',
    from: '+ `fill="${paint.ink}"/>`);',
    to: '+ `fill="#2a3444"/>`);',
  },
  {
    name: 'M5 the charge ticks move back over the face',
    why: 'the bug a screenshot found: the HUD covering the number the player multiplies',
    from: 'body.push(`<rect x="${f(x)}" y="0.042" width="${f(w)}" height="0.098" rx="0.03" ` +',
    to: 'body.push(`<rect x="${f(x)}" y="0.42" width="${f(w)}" height="0.098" rx="0.03" ` +',
  },
  {
    name: 'M6 the bomb ring goes back to dashed',
    why: 'reads as nine countable marks, i.e. a face value of 9, on a board where face value is money',
    from: '<circle cx="0.5" cy="0.56" r="0.33" fill="none" stroke="${paint.accent}"\n          stroke-width="0.05"/>',
    to: '<circle cx="0.5" cy="0.56" r="0.33" fill="none" stroke="${paint.accent}"\n          stroke-width="0.05" stroke-dasharray="0.14 0.09"/>',
  },
  {
    name: 'M8 the board draws a different face than the cell holds',
    subject: 'app',
    why: 'a sighted player and a screen-reader user told different numbers about the same cell',
    from: "tokenSvg(face as TokenKind, tokenState(state), TOKEN_PAINT, true, '', charge),",
    to: "tokenSvg((((face % 6) + 1) as TokenKind), tokenState(state), TOKEN_PAINT, true, '', charge),",
  },
  {
    name: 'M7 the corpus lighting becomes a flat veil',
    why: 'a tile with no vignette is decoration wearing a measurement’s clothes',
    from: 'const shade = v >= 0 ? \'#ffffff\' : \'#000000\';',
    to: 'const shade = \'#ffffff\';',
  },
];

let survived = 0;
for (const m of MUTANTS) {
  const which = m.subject ?? 'tokens';
  const original = ORIGINALS[which];
  if (!original.includes(m.from)) {
    console.log(`ANCHOR MISS  ${m.name}`);
    survived += 1;
    continue;
  }
  writeFileSync(SUBJECTS[which], original.replace(m.from, m.to));
  let caught = false;
  let first = '';
  try {
    execFileSync('npx', ['tsx', 'engine/verify/verify-tokens.ts'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    caught = true;
    const lines = String(err.stderr ?? '').split('\n');
    first = lines.find((l) => /^\s{2}P\d/.test(l))?.trim() ?? lines[0]?.trim() ?? '';
  }
  copyFileSync(BACKUPS[which], SUBJECTS[which]);
  if (caught) console.log(`CAUGHT    ${m.name}\n            by: ${first.slice(0, 130)}`);
  else {
    survived += 1;
    console.log(`SURVIVED  ${m.name}\n            (${m.why})`);
  }
}

for (const k of Object.keys(SUBJECTS)) copyFileSync(BACKUPS[k], SUBJECTS[k]);
console.log(`\ncurated: ${MUTANTS.length - survived}/${MUTANTS.length} caught`);
process.exit(survived === 0 ? 0 : 1);
