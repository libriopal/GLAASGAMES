// web/parity.ts — the measurement CI cannot take.
//
// The GPU parity job in CI executes sim.wgsl on Mesa's lavapipe, which is a
// software Vulkan device. That proves the shader is CORRECT — the limb multiply,
// the restoring sqrt over a hi/lo pair, the long division and the boundary
// response all agree with the reference bit for bit. It does not prove
// CROSS-VENDOR AGREEMENT on real Qualcomm, ARM, Apple or NVIDIA silicon.
//
// The engine is integer-only precisely so that vendor divergence cannot arise:
// there is no floating point in the simulation, so there is no FMA contraction
// to differ, no denormal handling to differ, no fast-math flag to differ. But
// that is an ARGUMENT, and this page is the MEASUREMENT. Open it in Chrome on a
// real phone and it will tell you whether the argument holds on that phone's
// GPU.
//
// It deliberately does not reuse engine/gpu/device.ts: that module reads the
// shader off disk with node:fs and cannot run in a browser. The dispatch
// plumbing below is therefore duplicated — but the SHADER is not, and neither is
// the reference kernel, so the two things being compared are the same two things
// CI compares.

import { parseSimConfig, packConfigForGpu, type RawConfig, type SimConfig } from '../engine/sim/config-parse.js';
import { formatHash, TickHashChain } from '../engine/sim/hash.js';
import { tick } from '../engine/sim/kernel.js';
import { WorldState } from '../engine/sim/state.js';
import { populate } from '../engine/sim/world-gen.js';

const TICKS = 600;
const SEED = 0x9a3f21c7 | 0;
const CAPACITY = 1024;
const DRIFTERS = 512;

function line(text: string, tone: 'plain' | 'good' | 'bad' = 'plain'): void {
  const out = document.getElementById('out');
  if (out === null) return;
  const row = document.createElement('div');
  row.className = tone;
  row.textContent = text;
  out.append(row);
}

/** Builds a world the same way both executors will, from the same seed. */
function freshWorld(config: SimConfig): WorldState {
  const world = new WorldState(CAPACITY);
  populate(world, config, SEED, DRIFTERS);
  return world;
}

async function run(): Promise<void> {
  const loaded = parseSimConfig(
    (await (await fetch('/engine/config/sim.json')).json()) as RawConfig,
  );
  // Shrink the pool for this run. The shader bounds its loop by the capacity in
  // the uniform, so the uniform and the allocated buffer MUST agree — packing
  // the full capacity while allocating a smaller buffer would have the shader
  // index past the end, and the comparison would be against clamped garbage.
  const config: SimConfig = { ...loaded, capacity: CAPACITY };

  // --- reference: the TypeScript kernel, on the CPU -------------------------
  const cpuWorld = freshWorld(config);
  const cpuChain = new TickHashChain();
  const cpuStart = performance.now();
  for (let i = 0; i < TICKS; i += 1) {
    tick(cpuWorld, config);
    cpuChain.push(cpuWorld.buffer);
  }
  const cpuMs = performance.now() - cpuStart;
  line(`reference : ${TICKS} ticks x ${CAPACITY} entities in ${cpuMs.toFixed(0)}ms`);
  line(`            digest ${formatHash(cpuChain.digest)}`);

  // --- WebGPU --------------------------------------------------------------
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (gpu === undefined) {
    line('WebGPU    : not available in this browser.', 'bad');
    line('            Android WebView does not expose WebGPU; Chrome for Android has', 'plain');
    line('            since version 121. Open this page in Chrome, not in an app.', 'plain');
    return;
  }

  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (adapter === null) {
    line('WebGPU    : navigator.gpu exists but no adapter was returned.', 'bad');
    return;
  }
  // `adapter.info` is the current spelling; `requestAdapterInfo()` is the older
  // one that some shipping Android builds still have. Try both.
  const legacy = adapter as GPUAdapter & {
    info?: GPUAdapterInfo;
    requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
  };
  const info = legacy.info ?? await legacy.requestAdapterInfo?.().catch(() => undefined);
  const described = info === undefined
    ? '(adapter would not describe itself)'
    : [info.vendor, info.architecture, info.device, info.description]
        .filter((part) => part !== undefined && part !== '').join(' / ') || '(blank)';
  line(`adapter   : ${described}`);

  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (event) => {
    line(`GPU error : ${String((event as GPUUncapturedErrorEvent).error.message)}`, 'bad');
  });

  const shader = await (await fetch('/engine/gpu/shaders/sim.wgsl')).text();
  const module = device.createShaderModule({ code: shader, label: 'sim.wgsl' });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'tick' },
  });

  const gpuWorld = freshWorld(config);
  const byteLength = gpuWorld.buffer.byteLength;

  const worldBuffer = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(worldBuffer, 0, gpuWorld.buffer);

  const paramsBuffer = device.createBuffer({
    size: 32 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, packConfigForGpu(config));

  const readback = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: worldBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
    ],
  });

  const workgroups = Math.ceil(config.capacity / config.workgroupSize);
  const gpuChain = new TickHashChain();
  const gpuStart = performance.now();

  // One dispatch, one readback, one hash, per tick. This is deliberately the
  // slow way round — a real host never reads back per tick — because the point
  // here is to compare EVERY tick, so that a divergence reports the tick it
  // first appeared on rather than only that the endpoints differ.
  for (let i = 0; i < TICKS; i += 1) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    encoder.copyBufferToBuffer(worldBuffer, 0, readback, 0, byteLength);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const snapshot = new Int32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    gpuChain.push(snapshot);

    if (i % 100 === 0) line(`            tick ${i}…`);
  }
  const gpuMs = performance.now() - gpuStart;

  line(`WebGPU    : ${TICKS} ticks in ${gpuMs.toFixed(0)}ms (per-tick readback, so this is not a speed figure)`);
  line(`            digest ${formatHash(gpuChain.digest)}`);

  const divergence = cpuChain.firstDivergence(gpuChain);
  if (divergence === -1) {
    line('', 'plain');
    line('PARITY HOLDS — bit-identical on every one of the ' + TICKS + ' ticks.', 'good');
    line('This GPU agrees with the reference executor exactly. Record the adapter', 'plain');
    line('string above; that is the measurement, and it is one CI cannot take.', 'plain');
  } else {
    line('', 'plain');
    line(`PARITY BROKEN — first divergence at tick ${divergence}.`, 'bad');
    line(`reference tick ${divergence}: ${formatHash(cpuChain.ticks[divergence] ?? 0)}`, 'bad');
    line(`WebGPU    tick ${divergence}: ${formatHash(gpuChain.ticks[divergence] ?? 0)}`, 'bad');
    line('This is a real finding: the integer-only argument does not hold on this', 'plain');
    line('silicon, or the shader has a bug lavapipe does not expose. Either way it', 'plain');
    line('is worth more than a green CI run.', 'plain');
  }
}

run().catch((error: unknown) => {
  line(`FAILED: ${error instanceof Error ? error.message : String(error)}`, 'bad');
});
