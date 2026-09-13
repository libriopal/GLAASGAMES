import { writeFileSync } from 'node:fs';
import { darkScreenSvg, type DarkView } from '../web/dark-screen.js';
import { seedUniverse, stepUniverse, cloneUniverse } from '../game/dark/nbody.js';
import { toFloat } from '../game/dark/fixed.js';
import { VOID_DEEP } from '../web/spectrum.js';

function shot(seed: number, steps: number, label: string, aim: {x:number;y:number;z:number}|null): DarkView {
  const u = seedUniverse(seed, 14);
  const trails: {x:number;y:number;z:number}[][] = u.bodies.map(() => []);
  for (let s = 0; s < steps; s++) {
    stepUniverse(u);
    if (s % 6 === 0) u.bodies.forEach((b, i) => trails[i]!.push({ x: toFloat(b.pos.x), y: toFloat(b.pos.y), z: toFloat(b.pos.z) }));
  }
  return { universe: u, trails: trails.map((t) => t.slice(-40)), label, aim };
}

const views = [
  shot(11, 1, 'SEEDED', null),
  shot(11, 260, 'RUNNING', null),
  shot(11, 260, 'AIMED', { x: 3, y: -1, z: 0 }),
];
const html = `<!doctype html><meta charset="utf-8"><title>darkmatter</title>
<style>body{margin:0;background:${VOID_DEEP};font-family:ui-monospace,monospace}
.row{display:flex;gap:18px;padding:20px}figcaption{color:#7e93ab;font-size:11px;padding-top:8px}</style>
<div class="row">${views.map((v) => `<figure style="margin:0">${darkScreenSvg(v)}<figcaption>${v.label}</figcaption></figure>`).join('')}</div>`;
writeFileSync('design/dark-sheet.html', html);
console.log('ok');
