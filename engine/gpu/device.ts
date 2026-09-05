// engine/gpu/device.ts — WebGPU acquisition and the GPU-resident sim executor.
//
// The world buffer is created once and lives in VRAM for the process lifetime.
// Ticks dispatch against it in place; nothing is uploaded per tick and nothing
// is read back unless the caller explicitly asks for a snapshot. That is what
// "GPU-authoritative" means here in practical terms — the CPU holds no copy of
// the world that it believes in.
//
// ON "RUNNING THE SERVER ON THE GPU": a GPU cannot host a server. It has no
// operating system, no network stack and no system calls; it executes kernels a
// host dispatches. What this module provides is the achievable form of that
// intent — the authoritative world state resides in GPU memory and is advanced
// by GPU kernels, while a deliberately thin CPU host does only socket I/O and
// input marshalling. The same WGSL runs under Node (via Dawn) and in a browser,
// so server and client execute one kernel, not two implementations that must be
// kept in agreement.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packConfigForGpu, type SimConfig } from '../sim/config.js';
import type { WorldState } from '../sim/state.js';

export interface GpuUnavailable {
  readonly available: false;
  readonly reason: string;
}

export interface GpuReady {
  readonly available: true;
  readonly executor: GpuSimExecutor;
}

export type GpuAcquisition = GpuReady | GpuUnavailable;

/** Reads the WGSL source. Exported so verify-parity can cross-check it without a device. */
export function readSimShaderSource(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, 'shaders', 'sim.wgsl'), 'utf8');
}

/**
 * Acquires a WebGPU device, or explains why it could not.
 *
 * Returns a discriminated result rather than throwing or returning null, because
 * "no GPU here" is an ordinary, expected condition — CI containers, headless
 * servers and locked-down browsers all hit it — and the caller's correct
 * response is to fall back to the CPU executor, not to crash. A bare null would
 * lose the reason, which is the one thing an operator actually needs.
 */
export async function acquireGpu(config: SimConfig): Promise<GpuAcquisition> {
  const globalGpu = (globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu;
  if (globalGpu === undefined) {
    return {
      available: false,
      reason:
        'navigator.gpu is undefined. In a browser this means WebGPU is disabled or unsupported; ' +
        'under Node it means no WebGPU binding is installed (see the "webgpu" package, which ships Dawn).',
    };
  }

  const gpu = globalGpu as {
    requestAdapter(options?: unknown): Promise<unknown>;
  };

  const adapter = (await gpu.requestAdapter({ powerPreference: 'high-performance' })) as {
    requestDevice(descriptor?: unknown): Promise<GpuDeviceLike>;
    info?: { vendor?: string; architecture?: string };
  } | null;

  if (adapter === null) {
    return {
      available: false,
      reason:
        'requestAdapter returned null: a WebGPU implementation is present but no adapter is ' +
        'usable. Typical causes are a headless container with no /dev/dri, a missing Vulkan or ' +
        'Metal driver, or a software rasteriser that was not enabled.',
    };
  }

  let device: GpuDeviceLike;
  try {
    device = await adapter.requestDevice();
  } catch (cause) {
    return { available: false, reason: `requestDevice failed: ${String(cause)}` };
  }

  return { available: true, executor: new GpuSimExecutor(device, config) };
}

/** The subset of GPUDevice this module uses, so the file type-checks without DOM lib types. */
interface GpuDeviceLike {
  createShaderModule(descriptor: { code: string; label?: string }): unknown;
  createBuffer(descriptor: {
    size: number;
    usage: number;
    label?: string;
    mappedAtCreation?: boolean;
  }): GpuBufferLike;
  createBindGroup(descriptor: unknown): unknown;
  createComputePipeline(descriptor: unknown): GpuPipelineLike;
  createCommandEncoder(descriptor?: unknown): GpuCommandEncoderLike;
  readonly queue: {
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView): void;
    submit(buffers: readonly unknown[]): void;
    onSubmittedWorkDone(): Promise<void>;
  };
  destroy(): void;
}

interface GpuBufferLike {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GpuPipelineLike {
  getBindGroupLayout(index: number): unknown;
}

interface GpuCommandEncoderLike {
  beginComputePass(descriptor?: unknown): {
    setPipeline(pipeline: unknown): void;
    setBindGroup(index: number, group: unknown): void;
    dispatchWorkgroups(x: number, y?: number, z?: number): void;
    end(): void;
  };
  copyBufferToBuffer(
    source: unknown,
    sourceOffset: number,
    destination: unknown,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): unknown;
}

// GPUBufferUsage / GPUMapMode flag values, per the WebGPU specification. Named
// here rather than read from globals so this module works under a Node binding
// that does not install the enums globally.
const USAGE_STORAGE = 0x0080;
const USAGE_UNIFORM = 0x0040;
const USAGE_COPY_SRC = 0x0004;
const USAGE_COPY_DST = 0x0008;
const USAGE_MAP_READ = 0x0001;
const MAP_MODE_READ = 0x0001;

/**
 * Owns the GPU-resident world and dispatches ticks against it.
 */
export class GpuSimExecutor {
  private readonly device: GpuDeviceLike;
  private readonly config: SimConfig;
  private readonly worldBuffer: GpuBufferLike;
  private readonly paramsBuffer: GpuBufferLike;
  private readonly readbackBuffer: GpuBufferLike;
  private readonly pipeline: GpuPipelineLike;
  private readonly bindGroup: unknown;
  private readonly workgroupCount: number;
  private readonly worldByteLength: number;
  private tickIndex: number;

  constructor(device: GpuDeviceLike, config: SimConfig) {
    this.device = device;
    this.config = config;
    this.tickIndex = 0;

    this.worldByteLength = config.capacity * 12 * 4;
    this.workgroupCount = Math.ceil(config.capacity / config.workgroupSize);

    const module = device.createShaderModule({
      code: readSimShaderSource(),
      label: 'glaas-sim-kernel',
    });

    this.worldBuffer = device.createBuffer({
      label: 'glaas-world',
      size: this.worldByteLength,
      usage: USAGE_STORAGE | USAGE_COPY_DST | USAGE_COPY_SRC,
    });

    this.paramsBuffer = device.createBuffer({
      label: 'glaas-sim-params',
      size: 24 * 4,
      usage: USAGE_UNIFORM | USAGE_COPY_DST,
    });

    // A separate MAP_READ buffer is required because a buffer that is mappable
    // cannot also be a storage binding. Snapshots copy world -> readback -> host.
    this.readbackBuffer = device.createBuffer({
      label: 'glaas-readback',
      size: this.worldByteLength,
      usage: USAGE_MAP_READ | USAGE_COPY_DST,
    });

    this.pipeline = device.createComputePipeline({
      label: 'glaas-sim-pipeline',
      layout: 'auto',
      compute: { module, entryPoint: 'tick' },
    });

    this.bindGroup = device.createBindGroup({
      label: 'glaas-sim-bindings',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.worldBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
      ],
    });

    device.queue.writeBuffer(this.paramsBuffer, 0, packConfigForGpu(config));
  }

  /** Uploads CPU world state into VRAM. Called once at startup, not per tick. */
  upload(world: WorldState): void {
    if (world.byteLength !== this.worldByteLength) {
      throw new Error(
        `GpuSimExecutor.upload: world is ${world.byteLength} bytes, executor expects ${this.worldByteLength}`,
      );
    }
    this.device.queue.writeBuffer(this.worldBuffer, 0, world.buffer);
  }

  /**
   * Dispatches `count` ticks.
   *
   * All ticks are encoded into a single command buffer. Each compute pass reads
   * what the previous pass wrote, and WebGPU guarantees passes within a command
   * buffer observe each other's writes in submission order, so no explicit
   * barrier is needed between them. Submitting once rather than per tick avoids
   * a queue round-trip that would dominate the cost at these workgroup counts.
   */
  dispatch(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`GpuSimExecutor.dispatch: count must be a non-negative integer`);
    }
    if (count === 0) return;

    const encoder = this.device.createCommandEncoder({ label: 'glaas-tick' });
    for (let index = 0; index < count; index += 1) {
      const pass = encoder.beginComputePass({ label: `tick-${this.tickIndex + index}` });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(this.workgroupCount);
      pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
    this.tickIndex += count;
  }

  /**
   * Copies the GPU world back to the host.
   *
   * This stalls the pipeline and should be used for verification, snapshots and
   * rendering handoff — not every tick. A GPU-authoritative design earns its
   * performance precisely by not doing this.
   */
  async snapshot(): Promise<Int32Array> {
    const encoder = this.device.createCommandEncoder({ label: 'glaas-snapshot' });
    encoder.copyBufferToBuffer(
      this.worldBuffer,
      0,
      this.readbackBuffer,
      0,
      this.worldByteLength,
    );
    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();

    await this.readbackBuffer.mapAsync(MAP_MODE_READ);
    // The mapped range is invalidated by unmap, so the data is copied out before
    // the buffer is released rather than handed to the caller by reference.
    const view = new Int32Array(this.readbackBuffer.getMappedRange().slice(0));
    this.readbackBuffer.unmap();
    return view;
  }

  destroy(): void {
    this.worldBuffer.destroy();
    this.paramsBuffer.destroy();
    this.readbackBuffer.destroy();
    this.device.destroy();
  }
}
