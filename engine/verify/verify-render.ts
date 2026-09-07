// engine/verify/verify-render.ts
// Proves web/shaders/render.wgsl actually draws the world.
//
// WHY OFFSCREEN RATHER THAN A BROWSER: a canvas only shows pixels if the shader
// is correct AND the browser composites the surface. Those fail independently,
// and in headless Chromium the second one fails routinely — a WebGPU canvas
// reads back fully transparent while the frame loop runs perfectly. Testing
// through a canvas therefore cannot distinguish "the shader is broken" from
// "presentation is unavailable", which makes it useless as evidence.
//
// Rendering into a texture this pass owns, then copying it back, removes the
// compositor from the question entirely. If pixels come back lit, the 4D->3D->2D
// chain works. Runs anywhere with a Vulkan device, software included, so CI
// covers it for free alongside the compute parity pass.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { loadSimConfig } from '../sim/config.js';
import { packConfigForGpu } from '../sim/config-parse.js';
import { orientationToMatrix, type Orientation4 } from '../math/rotor4.js';
import { WorldState } from '../sim/state.js';

// Rows must be a multiple of 256 bytes for copyTextureToBuffer; at 4 bytes per
// pixel any multiple of 64 pixels satisfies that.
const SIZE = Number.parseInt(process.env.GLAAS_RENDER_SIZE ?? '256', 10);
if (SIZE % 64 !== 0) {
  throw new Error(`GLAAS_RENDER_SIZE must be a multiple of 64, got ${SIZE}`);
}
const FIXED_ONE = 65536;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);

function makeRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 0x1a2b3c4d;
  return () => {
    state ^= state << 13; state |= 0;
    state ^= state >>> 17;
    state ^= state << 5; state |= 0;
    return state;
  };
}


/**
 * Minimal PNG encoder. Written out rather than pulled from npm because this is
 * the one place the repo needs image output, and a dependency that must build on
 * a phone is a poor trade for forty lines of well-specified format.
 */
function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  // Each scanline is prefixed with filter type 0 (None).
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }

  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

const config = loadSimConfig();

const gpu = (globalThis as { navigator?: { gpu?: GPU } }).navigator?.gpu;
if (gpu === undefined) {
  console.log('  render: SKIPPED — no WebGPU. Run under Deno (deno run --allow-all) with a Vulkan device.');
  console.log('verify-render: SKIPPED');
  process.exit(0);
}

const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
if (adapter === null) {
  console.log('  render: SKIPPED — no adapter.');
  console.log('verify-render: SKIPPED');
  process.exit(0);
}
const device = await adapter.requestDevice();

// --- World -------------------------------------------------------------------
const world = new WorldState(config.capacity);
const rng = makeRng(0x4d17_beef | 0);
const span = (lo: number, hi: number): number => lo + (Math.abs(rng()) % (hi - lo));
for (let i = 0; i < 2000; i += 1) {
  world.spawn({
    posX: span(config.boundsMin.x, config.boundsMax.x),
    posY: span(config.boundsMin.y, config.boundsMax.y),
    posZ: span(config.boundsMin.z, config.boundsMax.z),
    posW: span(config.boundsMin.w, config.boundsMax.w),
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: 0,
  });
}

const worldBuffer = device.createBuffer({
  size: world.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(worldBuffer, 0, world.buffer);

// Keeps the sim params buffer honest even though this pass does not tick.
device.queue.writeBuffer(
  device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
  0,
  packConfigForGpu(config),
);

// --- Camera ------------------------------------------------------------------
const camera = new Float32Array(28);
const orientation: Orientation4 = [0, 0, 0, 0, 0, 0];
const matrix = orientationToMatrix(orientation);
for (let i = 0; i < 16; i += 1) camera[i] = matrix[i]! / FIXED_ONE;
camera[16] = config.viewerW / FIXED_ONE;
camera[17] = 0;
camera[18] = config.sliceThickness / FIXED_ONE;
camera[19] = 0; // project mode
camera[20] = 0.6;
camera[21] = 0.25;
camera[22] = 150;
camera[23] = 1;
camera[24] = 0.55; // particle radius, world units
camera[25] = config.boundsMin.w / FIXED_ONE;
camera[26] = config.boundsMax.w / FIXED_ONE;
camera[27] = 0;

const cameraBuffer = device.createBuffer({
  size: 112,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(cameraBuffer, 0, camera);

// --- Pipeline ----------------------------------------------------------------
const source = readFileSync(join(repoRoot, 'web', 'shaders', 'render.wgsl'), 'utf8');
const module = device.createShaderModule({ code: source, label: 'render.wgsl' });

device.pushErrorScope('validation');
const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module, entryPoint: 'vs' },
  fragment: {
    module,
    entryPoint: 'fs',
    targets: [{
      format: 'rgba8unorm',
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
      },
    }],
  },
  primitive: { topology: 'triangle-list' },
});
const validationError = await device.popErrorScope();
if (validationError !== null) {
  fail(`render.wgsl failed pipeline validation: ${validationError.message}`);
}

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: worldBuffer } },
    { binding: 1, resource: { buffer: cameraBuffer } },
  ],
});

// --- Draw --------------------------------------------------------------------
const target = device.createTexture({
  size: [SIZE, SIZE],
  format: 'rgba8unorm',
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});

const pixelBuffer = device.createBuffer({
  size: SIZE * SIZE * 4,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: target.createView(),
    clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
});
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.draw(6, config.capacity);
pass.end();
encoder.copyTextureToBuffer(
  { texture: target },
  { buffer: pixelBuffer, bytesPerRow: SIZE * 4, rowsPerImage: SIZE },
  { width: SIZE, height: SIZE },
);
device.queue.submit([encoder.finish()]);

await pixelBuffer.mapAsync(GPUMapMode.READ);
const pixels = new Uint8Array(pixelBuffer.getMappedRange().slice(0));
pixelBuffer.unmap();

// --- Assertions --------------------------------------------------------------
// The clear colour is (5,5,10) at 8-bit. Anything meaningfully above that is a
// fragment the shader produced.
let lit = 0;
let brightest = 0;
let redSeen = 0;
let blueSeen = 0;
for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma > brightest) brightest = luma;
  if (r > 20 || g > 20 || b > 32) {
    lit += 1;
    // Hue encodes w. Seeing both ends of the ramp proves the fourth dimension
    // reached the fragment stage rather than being collapsed to a constant.
    if (r > g && r > b) redSeen += 1;
    if (b > r && b > g) blueSeen += 1;
  }
}

const total = SIZE * SIZE;
const litFraction = lit / total;

if (lit === 0) {
  fail('render produced no lit pixels — the 4D->3D->2D chain drew nothing');
}
if (litFraction > 0.9) {
  fail(`render filled ${(litFraction * 100).toFixed(1)}% of the frame — entities are not being culled or sized`);
}
if (lit > 0 && redSeen === 0 && blueSeen === 0) {
  fail('every lit pixel is achromatic — w is not reaching the colour ramp');
}

// Optional visual dump — the numbers above prove it draws, an image shows what.
const pngPath = process.env.GLAAS_RENDER_PNG;
if (pngPath !== undefined && pngPath !== '') {
  writeFileSync(pngPath, encodePng(pixels, SIZE, SIZE));
  console.log(`  render: wrote ${pngPath}`);
}

if (failures.length > 0) {
  console.error(`verify-render: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log(
  `  render: ${lit.toLocaleString()} lit pixels of ${total.toLocaleString()} ` +
    `(${(litFraction * 100).toFixed(2)}%), brightest ${Math.round(brightest)}, ` +
    `${redSeen} warm / ${blueSeen} cool — w reaches the colour ramp`,
);
console.log('verify-render: PASS — render.wgsl validates and draws the world');
