// engine/sim/state.ts — world state layout, shared by both executors.
//
// The layout is the contract between the TypeScript reference executor and the
// WGSL kernel. Both index the same flat Int32Array with the same stride and the
// same field offsets, so the CPU buffer can be uploaded to a GPU storage buffer
// with a straight memcpy and read back the same way. Any change here must be
// mirrored in engine/gpu/shaders/sim.wgsl; verify-parity.ts fails loudly if the
// two drift apart.
//
// WHY ARRAY-OF-STRUCTS: a 48-byte stride keeps each entity's position and
// velocity inside one or two cache lines on the CPU and, on the GPU, lets a
// workgroup invocation touch a single contiguous run rather than gathering from
// eight separate arrays. WGSL also aligns vec4<i32> to 16 bytes, which this
// stride satisfies exactly, so no padding is inserted behind our back.

/** i32 slots per entity. 12 slots = 48 bytes, a multiple of the 16-byte vec4 alignment. */
export const ENTITY_STRIDE = 12;

export const OFFSET_POS_X = 0;
export const OFFSET_POS_Y = 1;
export const OFFSET_POS_Z = 2;
export const OFFSET_POS_W = 3;
export const OFFSET_VEL_X = 4;
export const OFFSET_VEL_Y = 5;
export const OFFSET_VEL_Z = 6;
export const OFFSET_VEL_W = 7;
export const OFFSET_KIND = 8;
export const OFFSET_FLAGS = 9;
export const OFFSET_AGE = 10;
export const OFFSET_RESERVED = 11;

/** Bit 0 of OFFSET_FLAGS. A slot with this clear is free and must be skipped. */
export const FLAG_ALIVE = 1;

/**
 * Bit 1 of OFFSET_FLAGS. Set when a target has been collected. The slot is also
 * cleared of FLAG_ALIVE, so the tick loop skips it and the renderer culls it —
 * this bit exists so a collected target is distinguishable from an empty slot,
 * which matters because the state hash covers free slots too.
 */
export const FLAG_COLLECTED = 2;

/**
 * OFFSET_KIND values. Kind selects which rules apply, and is the reason the
 * field existed from the start:
 *   DRIFTER — ambient matter, full physics. Scenery that makes 4D legible.
 *   PLAYER  — host-owned. The tick applies no physics to it; the host writes its
 *             position each tick from input, so control is immediate rather than
 *             mediated by gravity and damping.
 *   TARGET  — static and collectible. No physics, so its position is knowable in
 *             advance by both executors without either reading the other's state.
 */
export const KIND_DRIFTER = 0;
export const KIND_PLAYER = 1;
export const KIND_TARGET = 2;

export interface EntitySpawn {
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
  readonly posW: number;
  readonly velX: number;
  readonly velY: number;
  readonly velZ: number;
  readonly velW: number;
  readonly kind: number;
}

/**
 * Fixed-capacity world state with a free-list slot pool.
 *
 * Capacity is fixed at construction and never grows. A growable buffer would
 * mean reallocating and re-uploading the GPU storage buffer mid-frame, which
 * stalls the pipeline; and an engine that cannot state its own memory ceiling
 * cannot be budgeted. Spawning past capacity fails by returning -1 rather than
 * throwing, so a burst of projectiles degrades into "no projectile" instead of
 * a crash.
 */
export class WorldState {
  readonly capacity: number;
  readonly buffer: Int32Array<ArrayBuffer>;

  /** Free slot indices. Pop to allocate, push to release — no scanning. */
  private readonly freeList: number[];
  private liveCount: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`WorldState: capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.buffer = new Int32Array(capacity * ENTITY_STRIDE);
    this.liveCount = 0;

    // Seed the free list in reverse so the first spawns take slots 0, 1, 2...
    // Sequential early slots keep GPU workgroups densely packed while the world
    // is filling, which matters because an inactive lane still costs its slot in
    // the dispatch.
    this.freeList = [];
    for (let index = capacity - 1; index >= 0; index -= 1) {
      this.freeList.push(index);
    }
  }

  get count(): number {
    return this.liveCount;
  }

  /** Returns the allocated slot index, or -1 when the pool is exhausted. */
  spawn(entity: EntitySpawn): number {
    const slot = this.freeList.pop();
    if (slot === undefined) return -1;

    const base = slot * ENTITY_STRIDE;
    const buffer = this.buffer;
    buffer[base + OFFSET_POS_X] = entity.posX | 0;
    buffer[base + OFFSET_POS_Y] = entity.posY | 0;
    buffer[base + OFFSET_POS_Z] = entity.posZ | 0;
    buffer[base + OFFSET_POS_W] = entity.posW | 0;
    buffer[base + OFFSET_VEL_X] = entity.velX | 0;
    buffer[base + OFFSET_VEL_Y] = entity.velY | 0;
    buffer[base + OFFSET_VEL_Z] = entity.velZ | 0;
    buffer[base + OFFSET_VEL_W] = entity.velW | 0;
    buffer[base + OFFSET_KIND] = entity.kind | 0;
    buffer[base + OFFSET_FLAGS] = FLAG_ALIVE;
    buffer[base + OFFSET_AGE] = 0;
    buffer[base + OFFSET_RESERVED] = 0;

    this.liveCount += 1;
    return slot;
  }

  /**
   * Releases a slot back to the pool.
   *
   * Zeroing the whole record rather than only clearing FLAG_ALIVE is deliberate:
   * the state hash covers every slot including free ones, so leaving stale
   * values behind would make the hash depend on spawn/despawn history rather
   * than on the observable world, and two runs that reach the same state by
   * different routes would disagree.
   */
  despawn(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) {
      throw new Error(`WorldState.despawn: slot ${slot} out of range`);
    }
    const base = slot * ENTITY_STRIDE;
    if ((this.buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) return;

    this.buffer.fill(0, base, base + ENTITY_STRIDE);
    this.freeList.push(slot);
    this.liveCount -= 1;
  }

  isAlive(slot: number): boolean {
    return (this.buffer[slot * ENTITY_STRIDE + OFFSET_FLAGS]! & FLAG_ALIVE) !== 0;
  }

  /** Byte length of the GPU storage buffer backing this state. */
  get byteLength(): number {
    return this.buffer.byteLength;
  }

  /** Replaces all state from a GPU readback. Length must match exactly. */
  adoptFrom(source: Int32Array): void {
    if (source.length !== this.buffer.length) {
      throw new Error(
        `WorldState.adoptFrom: expected ${this.buffer.length} i32, got ${source.length}`,
      );
    }
    this.buffer.set(source);

    // The GPU kernel may have cleared FLAG_ALIVE on expired entities, so the
    // free list and live count are rebuilt from the authoritative buffer rather
    // than assumed to still be correct.
    this.freeList.length = 0;
    this.liveCount = 0;
    for (let slot = this.capacity - 1; slot >= 0; slot -= 1) {
      if ((this.buffer[slot * ENTITY_STRIDE + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) {
        this.freeList.push(slot);
      } else {
        this.liveCount += 1;
      }
    }
  }
}
