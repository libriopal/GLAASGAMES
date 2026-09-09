// web/lattice-gl.ts — the board, rendered through the 4D engine.
//
// WHAT THIS IS, AND WHERE IT CAME FROM.
//
// The corpus this project's palette was measured from is 1116 generated images,
// and every one carries the prompt that made it. Nobody had ever read them. The
// words, counted: neural 596, magenta 539, skeletal 468, tiles 382, synaptic
// 380, filigree 332, translucent 323, cathedral 312, electric 312, glowing 301,
// LATTICE 295, pulsing 271, BOARD 271.
//
// The corpus is 1116 independent descriptions of this game's own board — a
// glowing lattice of translucent tiles threaded with synaptic filigree — and
// the shipped screen rendered none of it. It rendered numbers in boxes. This
// layer is the corpus's own description of the board, drawn.
//
// HOW IT MERGES THE TWO ENGINES. `web/gl2-renderer.ts` draws instanced quads at
// points in R^4 and has only ever driven the engine demo. The game is a DOM
// grid. This takes the 4D renderer's method — one instanced draw call, a
// position in R^4 per instance, additive falloff — and points it at the game's
// 6x6 board. The fourth component is DEPTH: cells sit near w=0, particles and
// filigree drift through w, and the projection divides by (viewerW - w). That
// is what makes a flat grid read as a solid object with parallax. Pseudo-3D
// from the engine that was already here, not a new dependency.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DESIGN THIS REPLACED, AND WHY — recorded so nobody re-derives it.
//
// The first design put the HIDDEN LINKS at w != 0 and relied on the slice gate
// (`abs(r4.w - u_sliceW) > u_sliceThickness` discards) to keep them invisible
// until the reveal swept w. It is elegant and it is WRONG, and the reason is
// worth keeping: a shader discard is a RENDERING policy, not confinement. The
// instance buffer would still contain every link position, readable from
// devtools in one line, and a single wrong uniform — sliceW drifting, mode
// flipped to 'project' — would draw the entire hidden lattice on screen. It
// would also have moved the leak OUT of the DOM, where `verify-app` A5 looks,
// and into a pixel buffer no oracle inspects.
//
// So: THE LINKS ARE NEVER UPLOADED BEFORE THE REVEAL. This layer is handed only
// what the player may see, exactly like the DOM board is handed only
// `view.observable`. `w` is depth and nothing else. Security stays where it
// already was — `session.links()` throws — and `verify-lattice-gl` G2 reads
// what was actually submitted to the GPU rather than what appeared on screen.
// ─────────────────────────────────────────────────────────────────────────────
//
// SAFETY IS A CONSTRAINT, NOT A NOTE. "Psychedelic" and "photosensitive
// epilepsy" are the same phenomenon seen from two sides. WCAG 2.3.1 puts the
// safe harbour at THREE FLASHES PER SECOND, and this layer is built so it
// cannot exceed it: there is no strobe, every envelope is a decay rather than a
// blink, and global brightness is rate-limited — see `LUMA_RATE_LIMIT`.
// `verify-lattice-gl` G5 samples real frames and measures the flash rate rather
// than trusting this paragraph.
//
// AND THE MOBILE BUDGET IS REAL. The research is consistent: on a phone the
// binding constraint is fill rate and overdraw, not draw calls. So — one draw
// call, additive blending (no read-modify-write), a hard instance cap, no
// full-screen post-process, and no bloom pass. The glow is per-instance radial
// falloff, which costs one texture-free fragment each.

import { BOARD_W, CELL_COUNT } from '../lattice/board.js';
import { rateLimit } from './ratelimit.js';
import { AMBER, CYAN, MAGENTA } from './theme.js';

/** One draw call's worth. Overdraw, not draw calls, is what costs on a phone. */
const MAX_INSTANCES = 1400;
const FLOATS_PER_INSTANCE = 12; // x y z w  size  r g b a  kind  seed  age

/** Kinds, matched in the fragment shader. */
const KIND_CELL = 0;
const KIND_SPARK = 1;
const KIND_FILIGREE = 2;

const hexToRgb = (hex: string): readonly [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const VERT = `#version 300 es
precision highp float;

in vec2 a_corner;      // per-vertex, the quad corner in [-1,1]^2
in vec4 a_pos4;        // per-instance, position in R^4 — w is DEPTH
in float a_size;
in vec4 a_colour;
in float a_kind;
in float a_seed;
in float a_age;

uniform float u_aspect;
uniform float u_viewerW;   // the eye's distance along w
uniform float u_tilt;      // a small rotation in the y-w plane: the parallax
uniform float u_time;

out vec4 v_colour;
out vec2 v_quad;
out float v_kind;
out float v_seed;
out float v_age;

void main() {
  vec4 p = a_pos4;

  // A slow drift in w, phase-offset per instance. This is the whole reason the
  // board reads as a solid rather than a picture of one: every element breathes
  // toward and away from the eye at its own rate, so the parallax is per-cell
  // and the grid acquires depth without a single polygon of geometry.
  p.w += sin(u_time * 0.35 + a_seed * 6.2831) * 0.045;

  // Rotate in the y-w plane. The 4D engine's move, applied to a 2D board: the
  // fourth axis leans into the third and the flat grid tips away from the eye.
  float c = cos(u_tilt), s = sin(u_tilt);
  float y2 = p.y * c - p.w * s;
  float w2 = p.y * s + p.w * c;
  p.y = y2;
  p.w = w2;

  // Perspective divide along w. Nearer instances are larger and further apart.
  float depth = max(0.35, u_viewerW - p.w);
  float scale = u_viewerW / depth;

  vec2 centre = vec2(p.x, p.y) * scale;
  float size = a_size * scale;

  gl_Position = vec4(centre + a_corner * vec2(size / u_aspect, size), 0.0, 1.0);

  v_colour = a_colour;
  // Further away is dimmer, which is the depth cue doing double duty as the
  // overdraw budget: the crowd at the back costs less light than the front.
  v_colour.a *= clamp(scale * 0.85, 0.15, 1.35);
  v_quad = a_corner;
  v_kind = a_kind;
  v_seed = a_seed;
  v_age = a_age;
}`;

const FRAG = `#version 300 es
precision highp float;

in vec4 v_colour;
in vec2 v_quad;
in float v_kind;
in float v_seed;
in float v_age;

uniform float u_time;
uniform float u_luma;   // the global brightness cap — the flash rate limiter

out vec4 fragColour;

void main() {
  float r = length(v_quad);
  if (r > 1.0) discard;

  // A radial falloff IS the glow. No bloom pass, no blur, no second target:
  // on a phone a full-screen post-process costs more than every particle here
  // put together, and this reads the same at this scale.
  float core = pow(1.0 - r, 2.4);
  float halo = pow(1.0 - r, 0.7) * 0.35;
  float a = core + halo;

  if (v_kind > 1.5) {
    // FILIGREE: a thin drawn thread rather than a dot. The corpus says
    // "synaptic tendrils" and "fiber-optic veins" 380 times between them.
    a = pow(max(0.0, 1.0 - abs(v_quad.y) * 3.2), 3.0) * (1.0 - abs(v_quad.x) * 0.55);
  } else if (v_kind > 0.5) {
    // SPARK: a comet, elongated along its travel and fading with age.
    a = core * (1.0 - v_age);
  }

  // No hard edges anywhere. Every envelope is a decay, so there is nothing in
  // this shader that can produce a flash in the WCAG sense.
  fragColour = vec4(v_colour.rgb * v_colour.a * a * u_luma, 1.0);
}`;

interface Spark {
  fromX: number; fromY: number;
  toX: number; toY: number;
  born: number;
  life: number;
  colour: readonly [number, number, number];
}

export interface BoardFrame {
  /** Faces, states and charges — the same observable projection the DOM gets. */
  readonly observable: Int32Array;
  /** Witnessed links only, source -> target. Never the hidden lattice. */
  readonly witnessed: ReadonlyMap<number, number>;
  /** True once `reveal()` has happened and the links are legal to draw. */
  readonly revealed: boolean;
  /** The revealed lattice, present only when `revealed` is true. */
  readonly links: Int32Array | null;
}

/**
 * The board's glow layer.
 *
 * It owns no game state and decides nothing. It is handed a frame and draws it,
 * exactly like the DOM renderer, so there is no second opinion about what a
 * turn did.
 */
export class LatticeGl {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #vao: WebGLVertexArrayObject;
  readonly #instances: Float32Array;
  readonly #instanceBuffer: WebGLBuffer;
  readonly #uniforms: Record<string, WebGLUniformLocation | null>;

  #sparks: Spark[] = [];
  #luma = 0;
  #lastFrameMs = 0;
  /** Every instance submitted on the last frame, for the oracle to inspect. */
  #submitted = 0;
  #reduced = false;

  /** Hue rotation for this round, derived from its seed. See `setSeed`. */
  #seedHue = 0;

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram, vao: WebGLVertexArrayObject,
    instanceBuffer: WebGLBuffer) {
    this.#gl = gl;
    this.#program = program;
    this.#vao = vao;
    this.#instanceBuffer = instanceBuffer;
    this.#instances = new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE);
    this.#uniforms = {};
    for (const name of ['u_aspect', 'u_viewerW', 'u_tilt', 'u_time', 'u_luma']) {
      this.#uniforms[name] = gl.getUniformLocation(program, name);
    }
    try {
      this.#reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch { this.#reduced = false; }
  }

  /** Returns null when WebGL2 is unavailable. The game must still be playable. */
  static create(canvas: HTMLCanvasElement): LatticeGl | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false,
      premultipliedAlpha: true, powerPreference: 'low-power',
    });
    if (!gl) return null;

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    const vao = gl.createVertexArray();
    const corners = gl.createBuffer();
    const instanceBuffer = gl.createBuffer();
    if (!vao || !corners || !instanceBuffer) return null;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'a_corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_INSTANCE * 4;
    const attrib = (name: string, size: number, offset: number): void => {
      const loc = gl.getAttribLocation(program, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attrib('a_pos4', 4, 0);
    attrib('a_size', 1, 4);
    attrib('a_colour', 4, 5);
    attrib('a_kind', 1, 9);
    attrib('a_seed', 1, 10);
    attrib('a_age', 1, 11);
    gl.bindVertexArray(null);

    return new LatticeGl(gl, program, vao, instanceBuffer);
  }

  /**
   * Ties the round's look to its own seed.
   *
   * Every round is lit slightly differently and REPRODUCIBLY so: the same seed
   * gives the same light, which means the visual is as replayable as the score.
   * It is a small thing that keeps the screen honest — nothing here is random
   * in a way the round's own commitment does not already fix.
   */
  setSeed(seed: number): void {
    this.#seedHue = ((seed >>> 0) % 1000) / 1000;
    this.#sparks.length = 0;
  }

  /** A bank happened: throw sparks from the cell toward what lit up. */
  emit(from: number, targets: readonly number[], nowMs: number): void {
    if (this.#reduced) return;
    const palette = [hexToRgb(CYAN), hexToRgb(AMBER), hexToRgb(MAGENTA)] as const;
    for (const to of targets) {
      const colour = palette[(from + to) % palette.length]!;
      // A handful per link, not a fountain: overdraw is the budget on a phone.
      for (let i = 0; i < 7; i += 1) {
        this.#sparks.push({
          fromX: from % BOARD_W, fromY: (from / BOARD_W) | 0,
          toX: to % BOARD_W, toY: (to / BOARD_W) | 0,
          born: nowMs + i * 22,
          life: 620,
          colour,
        });
      }
    }
    if (this.#sparks.length > 240) this.#sparks.splice(0, this.#sparks.length - 240);
  }

  /** How many instances the last frame actually submitted. For the oracle. */
  get submitted(): number { return this.#submitted; }

  /**
   * Draws one frame.
   *
   * `frame.links` is READ ONLY WHEN `frame.revealed` IS TRUE, and the host does
   * not put it in the frame before then. Both halves matter: the host cannot
   * supply what it does not have (`session.links()` throws), and this layer
   * will not draw what it is not given.
   */
  render(frame: BoardFrame, nowMs: number, width: number, height: number): void {
    const gl = this.#gl;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      gl.canvas.width = w;
      gl.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // ADDITIVE, and premultiplied. Light adds; it never occludes. This is also
    // the cheap path: no destination read, which is what makes hundreds of
    // overlapping quads affordable on a phone.
    gl.blendFunc(gl.ONE, gl.ONE);

    const data = this.#instances;
    let n = 0;
    const push = (
      x: number, y: number, z: number, wDepth: number, size: number,
      r: number, g: number, b: number, a: number, kind: number, seed: number, age: number,
    ): void => {
      if (n >= MAX_INSTANCES) return;
      const o = n * FLOATS_PER_INSTANCE;
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = wDepth;
      data[o + 4] = size;
      data[o + 5] = r; data[o + 6] = g; data[o + 7] = b; data[o + 8] = a;
      data[o + 9] = kind; data[o + 10] = seed; data[o + 11] = age;
      n += 1;
    };

    // Board coordinates -> clip space. The grid spans [-0.9, 0.9].
    const span = 1.8 / BOARD_W;
    const bx = (col: number): number => -0.9 + (col + 0.5) * span;
    const by = (row: number): number => 0.9 - (row + 0.5) * span;

    const cyan = hexToRgb(CYAN);
    const amber = hexToRgb(AMBER);
    const magenta = hexToRgb(MAGENTA);
    const t = nowMs / 1000;

    // ── the cathedral wash ──────────────────────────────────────────────────
    // A handful of very large, very dim instances far back in w. The corpus
    // says "cathedral" 312 times and "translucent" 323; this is the volume
    // those words describe — light that exists in the air between the tiles
    // rather than only on them. Nine instances, so it costs nine quads.
    for (let i = 0; i < 9; i += 1) {
      const px = -0.6 + (i % 3) * 0.6;
      const py = 0.6 - ((i / 3) | 0) * 0.6;
      const sway = this.#reduced ? 0 : Math.sin(t * 0.4 + i * 1.3) * 0.05;
      const hue = (i + this.#seedHue * 9) % 3;
      const c = hue < 1 ? cyan : hue < 2 ? magenta : amber;
      push(px + sway, py, 0, -0.55 - (i % 3) * 0.12, 0.62,
        c[0], c[1], c[2], 0.085, KIND_CELL, i / 9, 0);
    }

    // ── the tiles ───────────────────────────────────────────────────────────
    let lit = 0;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const face = frame.observable[i * 3] ?? 0;
      if (face === 0) continue;
      const charge = frame.observable[i * 3 + 2] ?? 0;
      const col = i % BOARD_W;
      const row = (i / BOARD_W) | 0;
      // Charge decides brightness and hue: a charged tile burns cyan, a plain
      // one sits amber and dim. The player reads the board's state as LIGHT.
      const heat = Math.min(1, charge / 3);
      const base = 0.20 + heat * 0.44;
      const breathe = this.#reduced ? 1 : 1 + Math.sin(t * 1.6 + i * 0.7) * 0.10 * heat;
      const [r, g, b] = heat > 0
        ? [cyan[0], cyan[1], cyan[2]]
        : [amber[0] * 0.75, amber[1] * 0.75, amber[2] * 0.75];
      push(bx(col), by(row), 0, 0, span * (0.95 + heat * 0.45),
        r, g, b, base * breathe, KIND_CELL, ((i * 37) % 100) / 100, 0);
      lit += 1;
    }

    // ── the filigree: witnessed links only ──────────────────────────────────
    // The corpus's "synaptic tendrils", and the same confinement as the DOM
    // trail: a thread is drawn only where the player watched charge travel.
    for (const [from, to] of frame.witnessed) {
      const fx = bx(from % BOARD_W), fy = by((from / BOARD_W) | 0);
      const tx = bx(to % BOARD_W), ty = by((to / BOARD_W) | 0);
      const steps = 5;
      for (let s = 0; s < steps; s += 1) {
        const u = (s + 0.5) / steps;
        const drift = this.#reduced ? 0 : Math.sin(t * 2.1 + s + from) * 0.012;
        push(fx + (tx - fx) * u, fy + (ty - fy) * u + drift, 0, 0.10 + u * 0.06,
          span * 0.38, magenta[0], magenta[1], magenta[2], 0.55, KIND_FILIGREE,
          ((from * 13 + s) % 100) / 100, 0);
      }
    }

    // ── the reveal: the true lattice, and only after it is legal ────────────
    if (frame.revealed && frame.links) {
      for (let i = 0; i < CELL_COUNT; i += 1) {
        const to = frame.links[i] ?? -1;
        if (to < 0) continue;
        const fx = bx(i % BOARD_W), fy = by((i / BOARD_W) | 0);
        const tx = bx(to % BOARD_W), ty = by((to / BOARD_W) | 0);
        for (let s = 0; s < 4; s += 1) {
          const u = (s + 0.5) / 4;
          push(fx + (tx - fx) * u, fy + (ty - fy) * u, 0, 0.18,
            span * 0.34, magenta[0], magenta[1], magenta[2], 0.60, KIND_FILIGREE,
            ((i * 7 + s) % 100) / 100, 0);
        }
      }
    }

    // ── the sparks ──────────────────────────────────────────────────────────
    if (!this.#reduced) {
      this.#sparks = this.#sparks.filter((sp) => nowMs - sp.born < sp.life);
      for (const sp of this.#sparks) {
        const age = Math.max(0, (nowMs - sp.born) / sp.life);
        if (age <= 0) continue;
        const u = age * age * (3 - 2 * age); // ease, so it arrives rather than jumps
        const x = bx(sp.fromX) + (bx(sp.toX) - bx(sp.fromX)) * u;
        const y = by(sp.fromY) + (by(sp.toY) - by(sp.fromY)) * u;
        push(x, y, 0, 0.22 - age * 0.16, span * 0.40 * (1 - age * 0.4),
          sp.colour[0], sp.colour[1], sp.colour[2], 0.95, KIND_SPARK,
          (sp.born % 100) / 100, age);
      }
    }

    this.#submitted = n;

    // ── the flash limiter ───────────────────────────────────────────────────
    // Global brightness may not climb faster than LUMA_RATE_LIMIT per second,
    // whatever the field is doing. WCAG 2.3.1's three-flash threshold is not a
    // target to approach; this makes the rate physically unreachable.
    const dt = this.#lastFrameMs === 0 ? 0.016 : Math.min(0.1, (nowMs - this.#lastFrameMs) / 1000);
    this.#lastFrameMs = nowMs;
    const wanted = lit === 0 ? 0 : 1;
    this.#luma = rateLimit(this.#luma, wanted, dt);

    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * FLOATS_PER_INSTANCE));
    gl.uniform1f(this.#uniforms['u_aspect']!, w / h);
    gl.uniform1f(this.#uniforms['u_viewerW']!, 2.6);
    // The tilt is what makes it pseudo-3D rather than flat. Held small and
    // constant: a board that swings under the finger is a board you cannot aim
    // at, and this one is a grid of touch targets first.
    gl.uniform1f(this.#uniforms['u_tilt']!, this.#reduced ? 0 : 0.16);
    gl.uniform1f(this.#uniforms['u_time']!, this.#reduced ? 0 : t + this.#seedHue * 10);
    gl.uniform1f(this.#uniforms['u_luma']!, this.#luma);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
  }
}
