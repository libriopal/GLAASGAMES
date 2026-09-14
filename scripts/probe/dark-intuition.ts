// WHY IS THE INTUITIVE RULE WORSE THAN GUESSING?
//
// The falsification probe returned legibility -0.176 against a random control of
// +0.080 for the rule "drop the mass on the bearing of the place you want your
// body to go". Anti-correlated. Before that becomes a finding it needs a
// mechanism, because "the heuristic is negative" is equally consistent with my
// having wired the heuristic backwards.
//
// THE HYPOTHESIS: over a few hundred steps the dominant effect of dropping a
// mass near an orbiting body is not a DISPLACEMENT TOWARD THE MASS. It is a
// change in orbital energy, which moves the body ALONG ITS ORBIT -- a phase
// shift. The naive mental model ("mass pulls, so my body goes that way") is the
// radial component, and the radial component is the small one.
//
// MEASURED DIRECTLY: the angle between the bearing of the drop and the bearing
// of the body's actual displacement from where it would have been.
//
//   near   0 degrees -> the body moves TOWARD the drop. Intuition is correct.
//   near  90 degrees -> the body moves ALONG its orbit. Intuition is orthogonal,
//                       which is worse than wrong: it is unrankable.
//   near 180 degrees -> the body moves AWAY. Intuition is exactly inverted, and
//                       a player who learns to invert it is playing a game.
//
// THE NEGATIVE CONTROL: the same measurement at a SHORT horizon, before orbital
// phase has had time to accumulate. If intuition is correct early and wrong
// late, the mechanism is confirmed and the horizon is the dial. If it is wrong
// at every horizon, something else is going on and the hypothesis is dead.
import { seedUniverse, stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99];
const SETTLE = 80;

function play(seed: number, bodies: number, ang: number | null, horizon: number): Universe {
  const u = seedUniverse(seed, bodies);
  for (let s = 0; s < SETTLE; s += 1) stepUniverse(u);
  if (ang !== null) {
    u.bodies.push({
      pos: { x: fromFloat(Math.cos(ang) * 7), y: fromFloat(Math.sin(ang) * 7), z: fromFloat(0.4) },
      vel: { x: 0n, y: 0n, z: 0n }, mass: fromFloat(1.1),
    });
  }
  for (let s = 0; s < horizon; s += 1) stepUniverse(u);
  return u;
}

const pos = (u: Universe) => [toFloat(u.bodies[0]!.pos.x), toFloat(u.bodies[0]!.pos.y)] as const;

console.log('── WHERE DOES THE BODY ACTUALLY GO WHEN YOU DROP A MASS? ──');
console.log('Angle between the DROP bearing (seen from the body) and the body\'s DISPLACEMENT.');
console.log('0 = intuition correct · 90 = orthogonal, unrankable · 180 = exactly inverted');
console.log('');
console.log('horizon | mean angle | median | share within 45 deg | share beyond 135 deg | mean |disp|');
console.log('--------+------------+--------+---------------------+----------------------+-----------');

for (const horizon of [30, 60, 120, 240, 360, 600]) {
  const angles: number[] = [];
  let disp = 0, n = 0;
  for (const seed of SEEDS) {
    const base = play(seed, 12, null, horizon);
    const [bx, by] = pos(base);
    // Where the body is at the MOMENT OF THE DECISION -- the drop bearing has to
    // be measured from there, because that is what the player sees.
    const at = seedUniverse(seed, 12);
    for (let s = 0; s < SETTLE; s += 1) stepUniverse(at);
    const [px, py] = [toFloat(at.bodies[0]!.pos.x), toFloat(at.bodies[0]!.pos.y)];
    for (let k = 0; k < 12; k += 1) {
      const ang = (k / 12) * Math.PI * 2;
      const u = play(seed, 12, ang, horizon);
      const [ux, uy] = pos(u);
      const dx = ux - bx, dy = uy - by;
      const mag = Math.hypot(dx, dy);
      if (mag < 1e-6) continue;
      // Bearing of the drop AS SEEN FROM THE BODY at decision time.
      const toDrop = Math.atan2(Math.sin(ang) * 7 - py, Math.cos(ang) * 7 - px);
      let a = Math.abs(Math.atan2(dy, dx) - toDrop);
      if (a > Math.PI) a = 2 * Math.PI - a;
      angles.push((a * 180) / Math.PI);
      disp += mag; n += 1;
    }
  }
  angles.sort((a, b) => a - b);
  const mean = angles.reduce((p, q) => p + q, 0) / angles.length;
  const med = angles[Math.floor(angles.length / 2)]!;
  const near = angles.filter((a) => a < 45).length / angles.length;
  const far = angles.filter((a) => a > 135).length / angles.length;
  console.log(
    `${String(horizon).padStart(7)} |${mean.toFixed(1).padStart(11)} |${med.toFixed(1).padStart(7)} |` +
    `${(near * 100).toFixed(1).padStart(19)}% |${(far * 100).toFixed(1).padStart(20)}% |${(disp / n).toFixed(3).padStart(10)}`,
  );
}

console.log('');
console.log('── THE SAME QUESTION FOR TORQUE, WHOSE INTUITION IS "MORE SPIN, MORE SPREAD" ──');
console.log('mag    | mean radius of the cluster after 360 steps  (monotone => intuitive)');
{
  for (const mag of [-0.09, -0.045, 0, 0.045, 0.09, 0.135]) {
    let r = 0, n = 0;
    for (const seed of SEEDS) {
      const u = seedUniverse(seed, 12);
      for (let s = 0; s < SETTLE; s += 1) stepUniverse(u);
      for (const q of u.bodies) {
        const px = toFloat(q.pos.x), py = toFloat(q.pos.y);
        const rr = Math.hypot(px, py) || 1;
        q.vel = { x: q.vel.x + fromFloat((-py / rr) * mag), y: q.vel.y + fromFloat((px / rr) * mag), z: q.vel.z };
      }
      for (let s = 0; s < 360; s += 1) stepUniverse(u);
      let cx = 0, cy = 0, m = 0;
      for (const b of u.bodies) { const w = toFloat(b.mass); cx += toFloat(b.pos.x) * w; cy += toFloat(b.pos.y) * w; m += w; }
      cx /= m; cy /= m;
      let rad = 0;
      for (const b of u.bodies) rad += Math.hypot(toFloat(b.pos.x) - cx, toFloat(b.pos.y) - cy);
      r += rad / u.bodies.length; n += 1;
    }
    console.log(`${mag.toFixed(3).padStart(6)} | ${(r / n).toFixed(3)}`);
  }
}
