// Is this universe actually three-dimensional? The render suggests not. Measure
// it rather than squint: principal extents of the mass distribution.
import { seedUniverse, stepUniverse } from '../../game/dark/nbody.js';
import { toFloat } from '../../game/dark/fixed.js';

for (const steps of [1, 260, 800]) {
  let ex = 0, ey = 0, ez = 0, evz = 0, n = 0;
  for (const seed of [11, 22, 33, 44, 55]) {
    const u = seedUniverse(seed, 14);
    for (let s = 0; s < steps; s++) stepUniverse(u);
    const xs = u.bodies.map((b) => toFloat(b.pos.x));
    const ys = u.bodies.map((b) => toFloat(b.pos.y));
    const zs = u.bodies.map((b) => toFloat(b.pos.z));
    const vz = u.bodies.map((b) => Math.abs(toFloat(b.vel.z)));
    const sd = (a: number[]) => { const m = a.reduce((p,q)=>p+q,0)/a.length; return Math.sqrt(a.reduce((p,q)=>p+(q-m)**2,0)/a.length); };
    ex += sd(xs); ey += sd(ys); ez += sd(zs); evz += vz.reduce((p,q)=>p+q,0)/vz.length; n++;
  }
  console.log(`step ${String(steps).padStart(3)} | spatial sd  x ${(ex/n).toFixed(2)}  y ${(ey/n).toFixed(2)}  z ${(ez/n).toFixed(2)}  | z as % of x ${((ez/ex)*100).toFixed(1)}%  | mean |vz| ${(evz/n).toFixed(4)}`);
}
