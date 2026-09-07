// web/main.ts — the browser host.
//
// This is the first thing in the repo that actually runs the engine rather than
// verifying it. It wires up the four modules that until now existed and were
// called by nothing: FixedTimestep drives the tick, rotor4 builds the 4D
// rotation, and projectTo3D / sliceTo3D have their logic executed in the vertex
// shader.
//
// It also closes the last open verification gap. The compute kernel here is
// engine/gpu/shaders/sim.wgsl, unmodified — the same file CI runs on software
// Vulkan. Running it in a phone browser executes it on real Adreno / Mali
// silicon, which is the cross-vendor measurement lavapipe structurally cannot
// provide. The overlay shows the live state digest so agreement is observable
// rather than asserted: if the phone's GPU matches CI, the digests match.

import { FixedTimestep } from '../engine/host/loop.js';
import { orientationToMatrix, type Orientation4 } from '../engine/math/rotor4.js';
import {
  PLAYER_POS_BYTE_OFFSET,
  packConfigForGpu,
  parseSimConfig,
  type RawConfig,
  type SimConfig,
} from '../engine/sim/config-parse.js';
import { Game, nearestTarget, type Input } from '../engine/sim/game.js';
import { formatHash, hashState } from '../engine/sim/hash.js';
import {
  ENTITY_STRIDE,
  KIND_DRIFTER,
  KIND_PLAYER,
  KIND_TARGET,
  OFFSET_POS_X,
  WorldState,
} from '../engine/sim/state.js';

const FIXED_ONE = 65536;

/** Writes a value into the HUD. Declared as a function so ordering cannot bite. */
function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el !== null) el.textContent = value;
}

/** Panics into the page rather than the console — a phone has no devtools to hand. */
function fatal(message: string, detail?: string): never {
  const el = document.getElementById('fatal');
  if (el !== null) {
    el.style.display = 'block';
    el.innerHTML = `<strong>${message}</strong>${detail ? `<pre>${detail}</pre>` : ''}`;
  }
  throw new Error(message);
}

/**
 * Seeded xorshift32. Math.random is banned tree-wide and, more practically, a
 * reproducible world is the whole point — the same seed must give the same
 * digest here as it does in CI.
 */
function makeRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 0x1a2b3c4d;
  return () => {
    state ^= state << 13;
    state |= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return state;
  };
}

/**
 * Composes the world: the player first, then targets, then ambient drifters.
 *
 * The player takes slot 0 deliberately — the host rewrites that record every
 * tick, and a fixed slot makes it a constant-offset write rather than a lookup.
 * Drifters come last so that exhausting capacity costs scenery rather than
 * anything the game depends on.
 */
function populate(world: WorldState, config: SimConfig, seed: number, drifters: number): number {
  const rng = makeRng(seed);
  const span = (lo: number, hi: number): number => lo + (Math.abs(rng()) % (hi - lo));

  const playerSlot = world.spawn({
    posX: (config.boundsMin.x + config.boundsMax.x) >> 1,
    posY: (config.boundsMin.y + config.boundsMax.y) >> 1,
    posZ: (config.boundsMin.z + config.boundsMax.z) >> 1,
    posW: (config.boundsMin.w + config.boundsMax.w) >> 1,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: KIND_PLAYER,
  });

  for (let i = 0; i < config.targetCount; i += 1) {
    world.spawn({
      posX: span(config.boundsMin.x, config.boundsMax.x),
      posY: span(config.boundsMin.y, config.boundsMax.y),
      posZ: span(config.boundsMin.z, config.boundsMax.z),
      // Targets use the full w extent. A target you can see but cannot reach
      // until you travel through w is the entire point of the game.
      posW: span(config.boundsMin.w, config.boundsMax.w),
      velX: 0, velY: 0, velZ: 0, velW: 0,
      kind: KIND_TARGET,
    });
  }

  for (let i = 0; i < drifters; i += 1) {
    world.spawn({
      posX: span(config.boundsMin.x, config.boundsMax.x),
      posY: span(config.boundsMin.y, config.boundsMax.y),
      posZ: span(config.boundsMin.z, config.boundsMax.z),
      posW: span(config.boundsMin.w, config.boundsMax.w),
      velX: rng() % (24 * FIXED_ONE),
      velY: rng() % (24 * FIXED_ONE),
      velZ: rng() % (24 * FIXED_ONE),
      velW: rng() % (7 * FIXED_ONE),
      kind: KIND_DRIFTER,
    });
  }
  return playerSlot;
}

interface Controls {
  yaw: number;
  pitch: number;
  distance: number;
  /** Q16.16 angles for the six R^4 planes: xy, xz, xw, yz, yw, zw. */
  orientation: [number, number, number, number, number, number];
  autoSpin: boolean;
  mode: 'project' | 'slice';
  sliceW: number;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (canvas === null) fatal('Canvas element missing');

  // --- Device ---------------------------------------------------------------
  if (navigator.gpu === undefined) {
    fatal(
      'WebGPU is not available in this browser.',
      'On Android use Chrome 121+ (or Edge). On desktop Firefox, enable dom.webgpu.enabled.\n' +
        'This page needs WebGPU because it runs the engine\'s real compute kernel — there is no fallback path that would be honest.',
    );
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (adapter === null) {
    fatal('No WebGPU adapter.', 'A WebGPU implementation is present but no GPU is usable.');
  }

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (cause) {
    return fatal('requestDevice failed', String(cause));
  }

  // The adapter identity IS the cross-vendor datapoint — record it visibly.
  const info = adapter.info;
  const adapterLabel = [info?.vendor, info?.architecture, info?.description]
    .filter((part) => part !== undefined && part !== '')
    .join(' / ') || 'vendor not disclosed';

  device.addEventListener('uncapturederror', (event) => {
    const err = (event as GPUUncapturedErrorEvent).error;
    fatal('GPU error', String(err.message));
  });

  // --- Config and world -----------------------------------------------------
  const configResponse = await fetch('/engine/config/sim.json');
  if (!configResponse.ok) fatal(`Could not fetch sim.json (HTTP ${configResponse.status})`);
  const config = parseSimConfig((await configResponse.json()) as RawConfig);

  const world = new WorldState(config.capacity);
  const playerSlot = populate(world, config, 0xfeed_4d17 | 0,
    Math.min(2200, config.capacity - config.targetCount - 1));

  const game = new Game(config);
  game.begin(world);

  const [simSource, renderSource] = await Promise.all([
    fetch('/engine/gpu/shaders/sim.wgsl').then((r) => r.text()),
    fetch('/web/shaders/render.wgsl').then((r) => r.text()),
  ]);

  // --- Buffers --------------------------------------------------------------
  const worldBuffer = device.createBuffer({
    label: 'glaas-world',
    size: world.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(worldBuffer, 0, world.buffer);

  const simParamsBuffer = device.createBuffer({
    label: 'glaas-sim-params',
    size: 32 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(simParamsBuffer, 0, packConfigForGpu(config));

  // mat4x4<f32> (64B) + 12 scalars (48B) = 112, rounded to 16-byte alignment.
  const cameraBuffer = device.createBuffer({
    label: 'glaas-camera',
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const readbackBuffer = device.createBuffer({
    label: 'glaas-readback',
    size: world.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // --- Pipelines ------------------------------------------------------------
  const simModule = device.createShaderModule({ code: simSource, label: 'sim.wgsl' });
  const renderModule = device.createShaderModule({ code: renderSource, label: 'render.wgsl' });

  const computePipeline = device.createComputePipeline({
    label: 'glaas-sim',
    layout: 'auto',
    compute: { module: simModule, entryPoint: 'tick' },
  });

  const context = canvas.getContext('webgpu');
  if (context === null) fatal('Could not get a webgpu canvas context');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const renderPipeline = device.createRenderPipeline({
    label: 'glaas-render',
    layout: 'auto',
    vertex: { module: renderModule, entryPoint: 'vs' },
    fragment: {
      module: renderModule,
      entryPoint: 'fs',
      targets: [
        {
          format,
          // Additive-over-black: overlapping entities brighten rather than
          // z-fighting, which suits a particle cloud and needs no depth buffer.
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: worldBuffer } },
      { binding: 1, resource: { buffer: simParamsBuffer } },
    ],
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: worldBuffer } },
      { binding: 1, resource: { buffer: cameraBuffer } },
    ],
  });

  // --- Controls -------------------------------------------------------------
  const controls: Controls = {
    yaw: 0.6,
    pitch: 0.25,
    distance: 150,
    orientation: [0, 0, 0, 0, 0, 0],
    autoSpin: true,
    mode: config.renderMode,
    sliceW: 0,
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });

  const endPointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointermove', (e) => {
    const previous = pointers.get(e.pointerId);
    if (previous === undefined) return;
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      if (e.shiftKey) {
        // Shift-drag turns the two dials that have no 3D analogue: the xw and yw
        // planes. This is the control that actually reveals the fourth dimension.
        controls.orientation[2] = (controls.orientation[2] + Math.round(dx * 90)) | 0;
        controls.orientation[4] = (controls.orientation[4] + Math.round(dy * 90)) | 0;
        controls.autoSpin = false;
      } else {
        controls.yaw -= dx * 0.006;
        controls.pitch = Math.max(-1.5, Math.min(1.5, controls.pitch + dy * 0.006));
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchStart > 0) {
        controls.distance = Math.max(20, Math.min(600, controls.distance * (pinchStart / spread)));
      }
      pinchStart = spread;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    controls.distance = Math.max(20, Math.min(600, controls.distance * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  const bind = (id: string, handler: () => void): void => {
    document.getElementById(id)?.addEventListener('click', handler);
  };
  bind('btn-spin', () => { controls.autoSpin = !controls.autoSpin; });
  bind('btn-mode', () => {
    controls.mode = controls.mode === 'project' ? 'slice' : 'project';
    setText('mode', controls.mode);
  });
  bind('btn-reset', () => {
    controls.orientation = [0, 0, 0, 0, 0, 0];
    controls.yaw = 0.6;
    controls.pitch = 0.25;
    controls.distance = 150;
  });

  // --- Input ----------------------------------------------------------------
  // Held directions rather than per-frame deltas: the simulation is fixed-step,
  // so input must be a state the tick samples, not an event stream whose rate
  // depends on the device.
  const held = { xPos: false, xNeg: false, zPos: false, zNeg: false,
                 yPos: false, yNeg: false, wPos: false, wNeg: false };

  const axisOf = (positive: boolean, negative: boolean): number =>
    (positive ? FIXED_ONE : 0) - (negative ? FIXED_ONE : 0);

  const currentInput = (): Input => ({
    x: axisOf(held.xPos, held.xNeg),
    y: axisOf(held.yPos, held.yNeg),
    z: axisOf(held.zPos, held.zNeg),
    w: axisOf(held.wPos, held.wNeg),
  });

  const KEYS: Record<string, keyof typeof held> = {
    KeyD: 'xPos', ArrowRight: 'xPos',
    KeyA: 'xNeg', ArrowLeft: 'xNeg',
    KeyW: 'zNeg', ArrowUp: 'zNeg',
    KeyS: 'zPos', ArrowDown: 'zPos',
    Space: 'yPos', ShiftLeft: 'yNeg',
    KeyE: 'wPos', KeyQ: 'wNeg',
  };
  addEventListener('keydown', (e) => {
    const slot = KEYS[e.code];
    if (slot !== undefined) { held[slot] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    const slot = KEYS[e.code];
    if (slot !== undefined) { held[slot] = false; e.preventDefault(); }
  });

  // Touch pad. pointerdown/up rather than click so a held button keeps moving,
  // and pointerleave/cancel so dragging off a button releases it instead of
  // sticking on — a stuck direction is the classic mobile control bug.
  for (const [id, slot] of Object.entries({
    'pad-up': 'zNeg', 'pad-down': 'zPos', 'pad-left': 'xNeg', 'pad-right': 'xPos',
    'pad-rise': 'yPos', 'pad-fall': 'yNeg', 'pad-ana': 'wPos', 'pad-kata': 'wNeg',
  } as Record<string, keyof typeof held>)) {
    const el = document.getElementById(id);
    if (el === null) continue;
    const press = (on: boolean) => (e: Event): void => { held[slot] = on; e.preventDefault(); };
    el.addEventListener('pointerdown', press(true));
    el.addEventListener('pointerup', press(false));
    el.addEventListener('pointerleave', press(false));
    el.addEventListener('pointercancel', press(false));
  }

  // --- Loop -----------------------------------------------------------------
  const timestep = new FixedTimestep(config);
  const workgroups = Math.ceil(config.capacity / config.workgroupSize);
  const cameraData = new Float32Array(28);
  const playerUniform = new Int32Array(4);
  const playerRecord = new Int32Array(ENTITY_STRIDE);

  let ticks = 0;
  let frames = 0;
  let droppedTotal = 0;
  let lastFpsAt = performance.now();
  let digest = '(sampling…)';
  let digestBusy = false;

  setText('adapter', adapterLabel);
  setText('entities', String(world.count));
  setText('mode', controls.mode);

  /**
   * Reads the world back and hashes it. This stalls the pipeline, so it runs at
   * most once a second and never blocks the frame — the whole point of a
   * GPU-resident design is that the world does not round-trip per tick.
   */
  const sampleDigest = async (): Promise<void> => {
    if (digestBusy) return;
    digestBusy = true;
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(worldBuffer, 0, readbackBuffer, 0, world.byteLength);
      device.queue.submit([encoder.finish()]);
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const snapshot = new Int32Array(readbackBuffer.getMappedRange().slice(0));
      readbackBuffer.unmap();
      digest = formatHash(hashState(snapshot));
    } catch {
      digest = '(readback failed)';
    } finally {
      digestBusy = false;
    }
  };

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  let lastDigestAt = 0;

  const frame = (now: number): void => {
    resize();

    // --- simulate ----------------------------------------------------------
    // FixedTimestep decides HOW MANY ticks to run; it never changes how long one
    // lasts. Every tick is the same dt, so the digest is reproducible regardless
    // of this device's frame rate.
    const step = timestep.advance(now);
    droppedTotal += step.droppedTicks;

    if (step.ticks > 0) {
      const input = currentInput();
      for (let i = 0; i < step.ticks; i += 1) {
        // Game before simulation: the shader scores against the player position
        // the host uploads, so the host must decide that position first. The
        // other order leaves the two a tick apart and they disagree about which
        // frame a target was taken on.
        game.advance(world, input);
        const player = game.state.player;

        // 16 bytes into the existing uniform — no new binding, no re-pack.
        playerUniform[0] = player.x;
        playerUniform[1] = player.y;
        playerUniform[2] = player.z;
        playerUniform[3] = player.w;
        device.queue.writeBuffer(simParamsBuffer, PLAYER_POS_BYTE_OFFSET, playerUniform);

        // Keep the player's own entity record in step so the renderer draws it
        // where the rules say it is. One 48-byte write, not a whole upload.
        playerRecord.set(world.buffer.subarray(
          playerSlot * ENTITY_STRIDE, (playerSlot + 1) * ENTITY_STRIDE));
        playerRecord[OFFSET_POS_X] = player.x;
        playerRecord[OFFSET_POS_X + 1] = player.y;
        playerRecord[OFFSET_POS_X + 2] = player.z;
        playerRecord[OFFSET_POS_X + 3] = player.w;
        world.buffer.set(playerRecord, playerSlot * ENTITY_STRIDE);
        device.queue.writeBuffer(
          worldBuffer, playerSlot * ENTITY_STRIDE * 4, playerRecord);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(computePipeline);
        pass.setBindGroup(0, computeBindGroup);
        pass.dispatchWorkgroups(workgroups);
        pass.end();
        device.queue.submit([encoder.finish()]);
      }
      ticks += step.ticks;
    }

    // --- camera ------------------------------------------------------------
    if (controls.autoSpin) {
      // Turn the xw and zw planes slowly. Rotating in a plane that includes w is
      // what makes 4D structure legible: extent hidden along w swings into view.
      controls.orientation[2] = (controls.orientation[2] + 140) | 0;
      controls.orientation[5] = (controls.orientation[5] + 95) | 0;
    }

    // rotor4 composes the six plane angles in fixed point; convert to f32 purely
    // for presentation.
    const fixedMatrix = orientationToMatrix(controls.orientation as unknown as Orientation4);
    for (let i = 0; i < 16; i += 1) cameraData[i] = fixedMatrix[i]! / FIXED_ONE;

    cameraData[16] = config.viewerW / FIXED_ONE;
    cameraData[17] = game.state.player.w / FIXED_ONE;
    cameraData[18] = config.sliceThickness / FIXED_ONE;
    cameraData[19] = controls.mode === 'project' ? 0 : 1;
    cameraData[20] = controls.yaw;
    cameraData[21] = controls.pitch;
    cameraData[22] = controls.distance;
    cameraData[23] = canvas.width / Math.max(canvas.height, 1);
    cameraData[24] = 0.55;   // particle radius, world units
    cameraData[25] = config.boundsMin.w / FIXED_ONE;
    cameraData[26] = config.boundsMax.w / FIXED_ONE;
    cameraData[27] = 0;
    device.queue.writeBuffer(cameraBuffer, 0, cameraData);

    // --- draw --------------------------------------------------------------
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(6, config.capacity);
    pass.end();
    device.queue.submit([encoder.finish()]);

    // --- overlay -----------------------------------------------------------
    frames += 1;
    if (now - lastFpsAt >= 250) {
      const gameState = game.state;
      setText('fps', (frames * 1000 / (now - lastFpsAt)).toFixed(0));
      setText('ticks', ticks.toLocaleString());
      setText('dropped', String(droppedTotal));
      setText('digest', digest);
      setText('score', `${gameState.collected} / ${gameState.total}`);
      setText('clock', `${game.seconds.toFixed(1)}s`);

      // The readout that makes 4D fair: a target can sit dead centre on screen
      // and still be unreachable. Saying so turns "broken" into "hard".
      const near = nearestTarget(world, gameState.player);
      setText('nearest', near === null
        ? '—'
        : `${near.spatial.toFixed(1)} away, ${near.alongW >= 0 ? '+' : ''}${near.alongW.toFixed(1)} along w`);
      setText('phase', gameState.phase === 'won'
        ? `COMPLETE in ${game.seconds.toFixed(1)}s`
        : gameState.phase);
      setText('playerw', game.state.player.w >= 0
        ? `+${(gameState.player.w / FIXED_ONE).toFixed(2)}`
        : (gameState.player.w / FIXED_ONE).toFixed(2));
      frames = 0;
      lastFpsAt = now;
    }
    if (now - lastDigestAt >= 1000) {
      lastDigestAt = now;
      void sampleDigest();
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

void main();
