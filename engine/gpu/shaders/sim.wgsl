// engine/gpu/shaders/sim.wgsl — the GPU-authoritative simulation kernel.
//
// A line-for-line port of engine/sim/kernel.ts. The step numbers below match
// that file's step numbers; when the two disagree, the TypeScript is correct by
// definition and this file is the bug.
//
// NOT A SINGLE FLOAT APPEARS IN THIS FILE, and that is the entire point. WGSL
// permits an implementation to contract a * b + c into a fused multiply-add with
// one rounding instead of two, and vendors make that choice differently, so f32
// arithmetic is not reproducible across GPUs. i32 and u32 arithmetic is exact
// and identical everywhere. All simulation math is Q16.16 fixed point.
//
// State lives in a storage buffer and stays in VRAM across ticks. The host
// dispatches, and reads back only when it needs a hash or a render snapshot —
// the world itself never round-trips through system memory.

// Must match ENTITY_STRIDE in engine/sim/state.ts.
const ENTITY_STRIDE: u32 = 12u;

const OFFSET_POS_X: u32 = 0u;
const OFFSET_VEL_X: u32 = 4u;
const OFFSET_KIND: u32 = 8u;
const OFFSET_FLAGS: u32 = 9u;
const OFFSET_AGE: u32 = 10u;

const FLAG_ALIVE: i32 = 1;
const FLAG_COLLECTED: i32 = 2;

const KIND_PLAYER: i32 = 1;
const KIND_TARGET: i32 = 2;

// Field order must match packConfigForGpu in engine/sim/config.ts.
struct SimParams {
  boundsMin: vec4<i32>,
  boundsMax: vec4<i32>,
  gravity: vec4<i32>,
  dtFixed: i32,
  linearDamping: i32,
  restitution: i32,
  maxSpeed: i32,
  capacity: i32,
  tickIndex: i32,
  pad0: i32,
  pad1: i32,

  // Rewritten every tick by the host at PLAYER_POS_BYTE_OFFSET (80). vec4<i32>
  // needs 16-byte alignment and byte 80 satisfies it.
  playerPos: vec4<i32>,

  collectRadiusSq: i32,
  collectRadius: i32,
  pad3: i32,
  pad4: i32,
};

@group(0) @binding(0) var<storage, read_write> world: array<i32>;
@group(0) @binding(1) var<uniform> params: SimParams;

// ---------------------------------------------------------------------------
// Fixed-point primitives. Ported from engine/math/fixed.ts; verify-parity.ts
// pins these to the TypeScript originals across a randomised operand sweep.
// ---------------------------------------------------------------------------

// Q16.16 multiply: (a * b) >> 16, without a 64-bit intermediate.
//
// WGSL has no i64, so the full product is assembled from 16-bit limbs:
//   |a|*|b| = a1*b1*2^32 + (a1*b0 + a0*b1)*2^16 + a0*b0
// and the >> 16 renormalisation gives
//   (a1*b1 << 16) + (a1*b0 + a0*b1) + (a0*b0 >> 16).
// Every term is evaluated in u32, whose overflow is defined as wrapping modulo
// 2^32 — the high bits that wrap away are exactly the ones the caller has
// promised the true result does not occupy.
fn mul_fixed(a: i32, b: i32) -> i32 {
  let negative: bool = (a < 0) != (b < 0);
  let ua: u32 = u32(abs(a));
  let ub: u32 = u32(abs(b));

  let a0: u32 = ua & 0xffffu;
  let a1: u32 = ua >> 16u;
  let b0: u32 = ub & 0xffffu;
  let b1: u32 = ub >> 16u;

  let lo: u32 = a0 * b0;
  let cross: u32 = a1 * b0 + a0 * b1;
  let hi: u32 = a1 * b1;

  let magnitude: u32 = (hi << 16u) + cross + (lo >> 16u);
  let signed: i32 = i32(magnitude);
  return select(signed, -signed, negative);
}

// Integer square root of a Q16.16 value, returned in Q16.16.
//
// The radicand is value << 16, a 48-bit quantity that does not fit in u32, so it
// is carried as a hi/lo pair of u32 limbs and the restoring algorithm operates
// on that pair. The TypeScript reference performs the same computation in a
// double, which is integer-exact to 2^53 and therefore covers the same range
// exactly; verify-parity.ts confirms the two agree.
fn sqrt_fixed(value: i32) -> i32 {
  if (value <= 0) {
    return 0;
  }

  // radicand = value * 65536, held as (hi, lo) with lo carrying the low 32 bits.
  let v: u32 = u32(value);
  var rem_hi: u32 = v >> 16u;
  var rem_lo: u32 = v << 16u;

  var root: u32 = 0u;
  // Start at the highest power of four representable in 48 bits: 2^46.
  var bit_hi: u32 = 1u << 14u; // 2^46 = bit_hi * 2^32
  var bit_lo: u32 = 0u;

  // Bring the probe bit down until it no longer exceeds the remainder.
  loop {
    if (bit_hi == 0u && bit_lo == 0u) { break; }
    if (bit_hi < rem_hi || (bit_hi == rem_hi && bit_lo <= rem_lo)) { break; }
    // Shift the 64-bit probe right by two.
    bit_lo = (bit_lo >> 2u) | (bit_hi << 30u);
    bit_hi = bit_hi >> 2u;
  }

  // Restoring square root over the 64-bit remainder.
  loop {
    if (bit_hi == 0u && bit_lo == 0u) { break; }

    // candidate = root + bit, as a 64-bit pair. root always fits in 32 bits
    // because the result is bounded by 2^24 for any i32 input.
    let cand_lo: u32 = root + bit_lo;
    let carry: u32 = select(0u, 1u, cand_lo < root);
    let cand_hi: u32 = bit_hi + carry;

    if (rem_hi > cand_hi || (rem_hi == cand_hi && rem_lo >= cand_lo)) {
      // remainder -= candidate
      let borrow: u32 = select(0u, 1u, rem_lo < cand_lo);
      rem_lo = rem_lo - cand_lo;
      rem_hi = rem_hi - cand_hi - borrow;
      root = (root >> 1u) + bit_lo;
    } else {
      root = root >> 1u;
    }

    bit_lo = (bit_lo >> 2u) | (bit_hi << 30u);
    bit_hi = bit_hi >> 2u;
  }

  return i32(root);
}

// Q16.16 divide: (a << 16) / b, truncating toward zero.
//
// Implemented as restoring long division on a 48-bit dividend rather than as a
// reciprocal multiply, because a reciprocal would introduce a rounding step that
// the CPU reference does not perform, and parity would fail in the last bit.
fn div_fixed(a: i32, b: i32) -> i32 {
  if (b == 0) {
    return 0;
  }
  let negative: bool = (a < 0) != (b < 0);
  let divisor: u32 = u32(abs(b));

  // dividend = |a| << 16, as a (hi, lo) pair.
  let ua: u32 = u32(abs(a));
  var rem: u32 = 0u;
  var quotient: u32 = 0u;

  // Long division, most significant bit first, over the 48-bit dividend.
  var index: i32 = 47;
  loop {
    if (index < 0) { break; }

    // Extract bit `index` of (|a| << 16).
    var bit: u32 = 0u;
    if (index >= 16) {
      let shift: u32 = u32(index - 16);
      if (shift < 32u) {
        bit = (ua >> shift) & 1u;
      }
    }

    rem = (rem << 1u) | bit;
    quotient = quotient << 1u;
    if (rem >= divisor) {
      rem = rem - divisor;
      quotient = quotient | 1u;
    }
    index = index - 1;
  }

  let signed: i32 = i32(quotient);
  return select(signed, -signed, negative);
}

// ---------------------------------------------------------------------------
// The tick. One invocation per entity slot.
// ---------------------------------------------------------------------------

@compute @workgroup_size(64)
fn tick(@builtin(global_invocation_id) gid: vec3<u32>) {
  let slot: u32 = gid.x;
  if (slot >= u32(params.capacity)) {
    return;
  }

  let base: u32 = slot * ENTITY_STRIDE;

  // Free slots are skipped, not compacted — see the note in kernel.ts. The
  // divergence this causes within a workgroup is harmless: entities do not
  // communicate, so an inactive lane costs its slot in the dispatch and nothing
  // more.
  if ((world[base + OFFSET_FLAGS] & FLAG_ALIVE) == 0) {
    return;
  }

  // --- Step 0: kind dispatch -------------------------------------------------
  // Mirrors kernel.ts exactly. The player is host-owned and receives no physics;
  // targets are static and collectible. Neither reads another entity's slot, so
  // the kernel stays embarrassingly parallel.
  let kind: i32 = world[base + OFFSET_KIND];

  if (kind == KIND_PLAYER) {
    world[base + OFFSET_AGE] = world[base + OFFSET_AGE] + 1;
    return;
  }

  if (kind == KIND_TARGET) {
    // Four-dimensional proximity. Accumulated x, y, z, w in that order because
    // fixed-point addition is not associative and kernel.ts sums the same way.
    let dx: i32 = world[base + OFFSET_POS_X]      - params.playerPos.x;
    let dy: i32 = world[base + OFFSET_POS_X + 1u] - params.playerPos.y;
    let dz: i32 = world[base + OFFSET_POS_X + 2u] - params.playerPos.z;
    let dw: i32 = world[base + OFFSET_POS_X + 3u] - params.playerPos.w;

    // Per-axis reject before squaring — mirrors kernel.ts. Without it the sum of
    // four squared deltas overflows i32 for distant targets, wraps negative, and
    // the farthest targets in the world collect themselves.
    let radius: i32 = params.collectRadius;
    if (dx > radius || dx < -radius || dy > radius || dy < -radius ||
        dz > radius || dz < -radius || dw > radius || dw < -radius) {
      world[base + OFFSET_AGE] = world[base + OFFSET_AGE] + 1;
      return;
    }

    var distance_squared: i32 = 0;
    distance_squared = distance_squared + mul_fixed(dx, dx);
    distance_squared = distance_squared + mul_fixed(dy, dy);
    distance_squared = distance_squared + mul_fixed(dz, dz);
    distance_squared = distance_squared + mul_fixed(dw, dw);

    if (distance_squared <= params.collectRadiusSq) {
      world[base + OFFSET_FLAGS] = FLAG_COLLECTED;
    }
    world[base + OFFSET_AGE] = world[base + OFFSET_AGE] + 1;
    return;
  }

  var velocity: vec4<i32> = vec4<i32>(
    world[base + OFFSET_VEL_X],
    world[base + OFFSET_VEL_X + 1u],
    world[base + OFFSET_VEL_X + 2u],
    world[base + OFFSET_VEL_X + 3u],
  );
  var position: vec4<i32> = vec4<i32>(
    world[base + OFFSET_POS_X],
    world[base + OFFSET_POS_X + 1u],
    world[base + OFFSET_POS_X + 2u],
    world[base + OFFSET_POS_X + 3u],
  );

  let dt: i32 = params.dtFixed;

  // --- Step 1: gravity into velocity (semi-implicit Euler) -----------------
  velocity.x = velocity.x + mul_fixed(params.gravity.x, dt);
  velocity.y = velocity.y + mul_fixed(params.gravity.y, dt);
  velocity.z = velocity.z + mul_fixed(params.gravity.z, dt);
  velocity.w = velocity.w + mul_fixed(params.gravity.w, dt);

  // --- Step 2: linear damping ----------------------------------------------
  velocity.x = mul_fixed(velocity.x, params.linearDamping);
  velocity.y = mul_fixed(velocity.y, params.linearDamping);
  velocity.z = mul_fixed(velocity.z, params.linearDamping);
  velocity.w = mul_fixed(velocity.w, params.linearDamping);

  // --- Step 3: speed clamp --------------------------------------------------
  // Accumulated in the same order as the TypeScript loop (x, y, z, w). Fixed
  // point is not associative, so summing in a different order can differ by a
  // unit and break parity.
  var speed_squared: i32 = 0;
  speed_squared = speed_squared + mul_fixed(velocity.x, velocity.x);
  speed_squared = speed_squared + mul_fixed(velocity.y, velocity.y);
  speed_squared = speed_squared + mul_fixed(velocity.z, velocity.z);
  speed_squared = speed_squared + mul_fixed(velocity.w, velocity.w);

  let max_speed_squared: i32 = mul_fixed(params.maxSpeed, params.maxSpeed);

  if (speed_squared > max_speed_squared && speed_squared > 0) {
    let speed: i32 = sqrt_fixed(speed_squared);
    if (speed > 0) {
      let ratio: i32 = div_fixed(params.maxSpeed, speed);
      velocity.x = mul_fixed(velocity.x, ratio);
      velocity.y = mul_fixed(velocity.y, ratio);
      velocity.z = mul_fixed(velocity.z, ratio);
      velocity.w = mul_fixed(velocity.w, ratio);
    }
  }

  // --- Step 4: integrate position ------------------------------------------
  position.x = position.x + mul_fixed(velocity.x, dt);
  position.y = position.y + mul_fixed(velocity.y, dt);
  position.z = position.z + mul_fixed(velocity.z, dt);
  position.w = position.w + mul_fixed(velocity.w, dt);

  // --- Step 5: boundary response, all four axes ----------------------------
  // Written out per axis rather than as a vector select, because the velocity
  // reflection is conditional per component and must apply in the same order the
  // reference walks the axes.
  if (position.x < params.boundsMin.x) {
    position.x = params.boundsMin.x;
    velocity.x = mul_fixed(-velocity.x, params.restitution);
  } else if (position.x > params.boundsMax.x) {
    position.x = params.boundsMax.x;
    velocity.x = mul_fixed(-velocity.x, params.restitution);
  }

  if (position.y < params.boundsMin.y) {
    position.y = params.boundsMin.y;
    velocity.y = mul_fixed(-velocity.y, params.restitution);
  } else if (position.y > params.boundsMax.y) {
    position.y = params.boundsMax.y;
    velocity.y = mul_fixed(-velocity.y, params.restitution);
  }

  if (position.z < params.boundsMin.z) {
    position.z = params.boundsMin.z;
    velocity.z = mul_fixed(-velocity.z, params.restitution);
  } else if (position.z > params.boundsMax.z) {
    position.z = params.boundsMax.z;
    velocity.z = mul_fixed(-velocity.z, params.restitution);
  }

  if (position.w < params.boundsMin.w) {
    position.w = params.boundsMin.w;
    velocity.w = mul_fixed(-velocity.w, params.restitution);
  } else if (position.w > params.boundsMax.w) {
    position.w = params.boundsMax.w;
    velocity.w = mul_fixed(-velocity.w, params.restitution);
  }

  // --- Write back -----------------------------------------------------------
  world[base + OFFSET_POS_X] = position.x;
  world[base + OFFSET_POS_X + 1u] = position.y;
  world[base + OFFSET_POS_X + 2u] = position.z;
  world[base + OFFSET_POS_X + 3u] = position.w;

  world[base + OFFSET_VEL_X] = velocity.x;
  world[base + OFFSET_VEL_X + 1u] = velocity.y;
  world[base + OFFSET_VEL_X + 2u] = velocity.z;
  world[base + OFFSET_VEL_X + 3u] = velocity.w;

  // --- Step 6: age ----------------------------------------------------------
  world[base + OFFSET_AGE] = world[base + OFFSET_AGE] + 1;
}
