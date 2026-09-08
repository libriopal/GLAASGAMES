// web/gl2-renderer.ts — the same picture, drawn without WebGPU.
//
// WHY THIS EXISTS: Android's WebView does not expose WebGPU. Chrome for Android
// has shipped it since 121, but the WebView component — which is what an
// installed APK renders with — does not, and an app that only draws on one of
// those two is not an app you can ship. So the engine gets a second renderer.
//
// WHAT IS AND IS NOT DUPLICATED: the 4D -> 3D -> 2D chain is duplicated, in
// GLSL ES 3.00 instead of WGSL, because there is no way to share a shader across
// the two APIs. The SIMULATION is not duplicated and never will be — that stays
// integer, in one place, with a digest proving it. Rasterisation is allowed to
// differ between renderers because nothing downstream reads a pixel; the whole
// integer-only discipline exists for the simulation, not for the picture.
//
// WHY INSTANCED ATTRIBUTES RATHER THAN A STORAGE BUFFER: WebGL2 has no storage
// buffers. The WebGPU path keeps the world in VRAM and never reads it back; here
// the world is already on the CPU (this host simulates there), so the per-entity
// data is packed into an instanced vertex buffer each frame. At the capacities
// this host runs — a few thousand entities — that is a ~50KB upload per frame,
// which is nothing next to the draw itself.

import { ENTITY_STRIDE, FLAG_ALIVE, OFFSET_FLAGS, OFFSET_KIND, OFFSET_POS_X } from '../engine/sim/state.js';

const FIXED_SCALE = 65536;
const FLOATS_PER_INSTANCE = 5; // x, y, z, w, kind

const VERTEX_SOURCE = `#version 300 es
precision highp float;

in vec2 a_corner;      // per-vertex: the quad corner, [-1,1]^2
in vec4 a_pos4;        // per-instance: position in R^4
in float a_kind;       // per-instance: 0 drifter, 1 player, 2 target

uniform mat4 u_rot4;         // the six plane angles, composed on the CPU
uniform float u_viewerW;
uniform float u_sliceW;
uniform float u_sliceThickness;
uniform float u_mode;        // 0 project, 1 slice
uniform float u_yaw;
uniform float u_pitch;
uniform float u_distance;
uniform float u_aspect;
uniform float u_pointSize;
uniform float u_wMin;
uniform float u_wMax;

out vec3 v_colour;
out vec2 v_quadUV;
out float v_fade;

vec3 hueToRgb(float hue) {
  float h = fract(hue) * 6.0;
  float c = abs(h - 3.0) - 1.0;
  return clamp(vec3(c, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), vec3(0.0), vec3(1.0));
}

void main() {
  // --- 2. rotate in R^4 ----------------------------------------------------
  vec4 r4 = u_rot4 * a_pos4;

  // --- 3. collapse w -------------------------------------------------------
  vec3 p3;
  if (u_mode < 0.5) {
    float depth = u_viewerW - r4.w;
    if (depth <= 0.001) {
      // Far outside the clip volume discards the whole primitive, which is
      // cheaper and better defined than emitting w = 0.
      gl_Position = vec4(1.0e6, 1.0e6, 1.0e6, 1.0);
      v_colour = vec3(0.0); v_quadUV = vec2(0.0); v_fade = 0.0;
      return;
    }
    p3 = r4.xyz * (u_viewerW / depth);
  } else {
    if (abs(r4.w - u_sliceW) > u_sliceThickness) {
      gl_Position = vec4(1.0e6, 1.0e6, 1.0e6, 1.0);
      v_colour = vec3(0.0); v_quadUV = vec2(0.0); v_fade = 0.0;
      return;
    }
    p3 = r4.xyz;
  }

  // --- 4. orbit camera, then perspective -----------------------------------
  float cy = cos(u_yaw),   sy = sin(u_yaw);
  float cp = cos(u_pitch), sp = sin(u_pitch);
  vec3 yawed = vec3(cy * p3.x + sy * p3.z, p3.y, -sy * p3.x + cy * p3.z);
  vec3 view = vec3(yawed.x, cp * yawed.y - sp * yawed.z, sp * yawed.y + cp * yawed.z);
  view.z += u_distance;

  if (view.z <= 0.01) {
    gl_Position = vec4(1.0e6, 1.0e6, 1.0e6, 1.0);
    v_colour = vec3(0.0); v_quadUV = vec2(0.0); v_fade = 0.0;
    return;
  }

  float focal = 1.0 / tan(0.5 * 1.05);   // ~60 degree vertical field of view

  // GL clip space is z in [-w, w] where WGSL uses [0, w]. Mapping view.z into
  // the near half of that range keeps the same depth ordering without a depth
  // buffer, which this additive particle pass does not use.
  vec4 clip = vec4(
    view.x * focal / u_aspect,
    view.y * focal,
    view.z * 0.001,
    view.z
  );

  // --- 5. expand to a screen-facing quad -----------------------------------
  // pointSize is a radius in WORLD units, and the offset is scaled by focal
  // length ONLY. The perspective divide that happens after this shader is what
  // shrinks distant particles; dividing by view.z here as well would apply the
  // falloff twice, and multiplying back by clip.w — which is view.z — cancels it
  // entirely and fills the screen with one blob. That bug shipped once in the
  // WebGPU path and was caught by an offscreen render check.
  float sizeScale = 1.0;
  if (a_kind > 0.5 && a_kind < 1.5) { sizeScale = 4.2; }
  else if (a_kind > 1.5) { sizeScale = 2.6; }

  clip.x += a_corner.x * u_pointSize * sizeScale * focal / u_aspect;
  clip.y += a_corner.y * u_pointSize * sizeScale * focal;
  gl_Position = clip;
  v_quadUV = a_corner;

  // Colour encodes w. Without it the scene collapses into an indistinguishable
  // 3D cloud and the one thing that makes this engine interesting is invisible.
  float wNorm = clamp((r4.w - u_wMin) / max(u_wMax - u_wMin, 0.0001), 0.0, 1.0);
  if (a_kind > 0.5 && a_kind < 1.5) {
    v_colour = vec3(1.0);
  } else if (a_kind > 1.5) {
    v_colour = mix(hueToRgb(0.62 - 0.62 * wNorm), vec3(1.0), 0.45) * 1.6;
  } else {
    v_colour = hueToRgb(0.62 - 0.62 * wNorm) * 0.55;
  }

  v_fade = clamp(1.4 - view.z / max(u_distance * 2.0, 1.0), 0.15, 1.0);
  if (a_kind > 0.5 && a_kind < 1.5) { v_fade = 1.0; }
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec3 v_colour;
in vec2 v_quadUV;
in float v_fade;
out vec4 fragColour;

void main() {
  // Round the quad into a soft disc; a square blob reads as a bug.
  float d = length(v_quadUV);
  if (d > 1.0) discard;
  float edge = smoothstep(1.0, 0.35, d);
  fragColour = vec4(v_colour * v_fade, edge * v_fade);
}
`;

export interface Gl2Camera {
  /** Column-major 4x4, the six R^4 plane angles already composed. */
  readonly rot4: Float32Array;
  readonly viewerW: number;
  readonly sliceW: number;
  readonly sliceThickness: number;
  readonly mode: 'project' | 'slice';
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly pointSize: number;
  readonly wMin: number;
  readonly wMax: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('could not create a shader object');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no log)';
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

/**
 * Draws the world with WebGL2.
 *
 * `capacity` fixes the instance buffer size once; the pool never grows, so the
 * buffer is allocated at construction and no frame allocates. That matters more
 * here than it would elsewhere — this renderer runs on the phone, where a
 * per-frame allocation becomes a garbage collection pause the player feels as a
 * stutter.
 */
export class Gl2Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly instanceData: Float32Array;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext, capacity: number) {
    this.gl = gl;
    this.instanceData = new Float32Array(capacity * FLOATS_PER_INSTANCE);

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const program = gl.createProgram();
    if (program === null) throw new Error('could not create a program object');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? '(no log)'}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    this.program = program;

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('could not create a vertex array object');
    this.vao = vao;
    gl.bindVertexArray(vao);

    // Two triangles covering [-1,1]^2, shared by every instance.
    const cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const cornerLocation = gl.getAttribLocation(program, 'a_corner');
    gl.enableVertexAttribArray(cornerLocation);
    gl.vertexAttribPointer(cornerLocation, 2, gl.FLOAT, false, 0, 0);

    const instanceBuffer = gl.createBuffer();
    if (instanceBuffer === null) throw new Error('could not create the instance buffer');
    this.instanceBuffer = instanceBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4;
    const posLocation = gl.getAttribLocation(program, 'a_pos4');
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(posLocation, 1);

    const kindLocation = gl.getAttribLocation(program, 'a_kind');
    gl.enableVertexAttribArray(kindLocation);
    gl.vertexAttribPointer(kindLocation, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(kindLocation, 1);

    gl.bindVertexArray(null);

    this.uniforms = {};
    for (const name of [
      'u_rot4', 'u_viewerW', 'u_sliceW', 'u_sliceThickness', 'u_mode',
      'u_yaw', 'u_pitch', 'u_distance', 'u_aspect', 'u_pointSize', 'u_wMin', 'u_wMax',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
  }

  /**
   * Packs the live entities into the instance buffer.
   *
   * Returns the instance count. Dead slots are skipped rather than drawn and
   * discarded in the shader — an empty pool should cost an empty draw call, not
   * a full one.
   */
  private pack(world: Int32Array, capacity: number): number {
    const data = this.instanceData;
    let instances = 0;
    for (let slot = 0; slot < capacity; slot += 1) {
      const base = slot * ENTITY_STRIDE;
      if ((world[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;
      const out = instances * FLOATS_PER_INSTANCE;
      data[out] = world[base + OFFSET_POS_X]! / FIXED_SCALE;
      data[out + 1] = world[base + OFFSET_POS_X + 1]! / FIXED_SCALE;
      data[out + 2] = world[base + OFFSET_POS_X + 2]! / FIXED_SCALE;
      data[out + 3] = world[base + OFFSET_POS_X + 3]! / FIXED_SCALE;
      data[out + 4] = world[base + OFFSET_KIND]!;
      instances += 1;
    }
    return instances;
  }

  draw(world: Int32Array, capacity: number, camera: Gl2Camera, width: number, height: number): number {
    const gl = this.gl;
    const instances = this.pack(world, capacity);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0.02, 0.02, 0.039, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Additive-over-black: overlapping entities brighten rather than z-fight,
    // which suits a particle cloud and needs no depth buffer.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);

    if (instances === 0) return 0;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, instances * FLOATS_PER_INSTANCE);

    const u = this.uniforms;
    gl.uniformMatrix4fv(u['u_rot4']!, false, camera.rot4);
    gl.uniform1f(u['u_viewerW']!, camera.viewerW);
    gl.uniform1f(u['u_sliceW']!, camera.sliceW);
    gl.uniform1f(u['u_sliceThickness']!, camera.sliceThickness);
    gl.uniform1f(u['u_mode']!, camera.mode === 'slice' ? 1 : 0);
    gl.uniform1f(u['u_yaw']!, camera.yaw);
    gl.uniform1f(u['u_pitch']!, camera.pitch);
    gl.uniform1f(u['u_distance']!, camera.distance);
    gl.uniform1f(u['u_aspect']!, width / Math.max(1, height));
    gl.uniform1f(u['u_pointSize']!, camera.pointSize);
    gl.uniform1f(u['u_wMin']!, camera.wMin);
    gl.uniform1f(u['u_wMax']!, camera.wMax);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances);
    gl.bindVertexArray(null);
    return instances;
  }
}
