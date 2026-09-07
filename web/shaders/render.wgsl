// web/shaders/render.wgsl — draws the 4D world.
//
// FLOATS ARE ALLOWED HERE, and only here. The integer-only rule exists so the
// *simulation* is bit-reproducible across vendors; rasterisation has no such
// requirement — two GPUs may shade a pixel a fraction differently and nothing
// downstream depends on it. verify-parity scans sim.wgsl alone, for exactly this
// reason. Nothing in this file may ever write back into the world buffer: it is
// bound read-only, so the compiler enforces that rather than the author.
//
// The vertex shader does the whole 4D -> 3D -> 2D chain per instance:
//   1. read the entity's Q16.16 vec4 position and convert to float
//   2. rotate it in R^4 by the camera's six plane angles
//   3. collapse w, either by perspective divide or by slicing
//   4. orbit-camera the resulting 3D point and project to the screen
//   5. expand to a screen-facing quad so the entity is visible at all
//
// Instanced: 6 vertices (two triangles) x capacity instances. No vertex buffer
// exists — positions are read from the same storage buffer the compute kernel
// writes, so the world never leaves VRAM to be drawn.

const ENTITY_STRIDE: u32 = 12u;
const OFFSET_POS_X: u32 = 0u;
const OFFSET_VEL_X: u32 = 4u;
const OFFSET_FLAGS: u32 = 9u;
const FLAG_ALIVE: i32 = 1;

const FIXED_SCALE: f32 = 65536.0;

struct Camera {
  // The 4D rotation, six plane angles composed on the CPU into a matrix. Sent as
  // f32 because it is only ever used for presentation — the simulation's own
  // orientation math stays in fixed point.
  rot4: mat4x4<f32>,

  viewerW: f32,      // where the 4D viewer sits on the w axis (project mode)
  sliceW: f32,       // which w hyperplane to cross-section (slice mode)
  sliceThickness: f32,
  mode: f32,         // 0 = project, 1 = slice

  yaw: f32,
  pitch: f32,
  distance: f32,
  aspect: f32,

  pointSize: f32,
  wMin: f32,         // bounds on w, used to map depth-in-w to hue
  wMax: f32,
  pad: f32,
};

@group(0) @binding(0) var<storage, read> world: array<i32>;
@group(0) @binding(1) var<uniform> camera: Camera;

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) colour: vec3<f32>,
  @location(1) quadUV: vec2<f32>,
  @location(2) fade: f32,
};

/// Two triangles covering [-1,1]^2, indexed by vertex_index 0..5.
fn quadCorner(index: u32) -> vec2<f32> {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
  );
  return corners[index];
}

/// Hue -> RGB, saturation and value fixed at 1. Used to encode w as colour.
fn hueToRgb(hue: f32) -> vec3<f32> {
  let h = fract(hue) * 6.0;
  let c = abs(h - 3.0) - 1.0;
  return clamp(vec3<f32>(c, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), vec3<f32>(0.0), vec3<f32>(1.0));
}

/// Placing a vertex here puts it far outside the clip volume, so the whole
/// primitive is discarded. Cheaper and better defined than emitting w = 0.
fn culled() -> VertexOut {
  var out: VertexOut;
  out.clip = vec4<f32>(1.0e6, 1.0e6, 1.0e6, 1.0);
  out.colour = vec3<f32>(0.0);
  out.quadUV = vec2<f32>(0.0);
  out.fade = 0.0;
  return out;
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  let base = instance * ENTITY_STRIDE;

  if ((world[base + OFFSET_FLAGS] & FLAG_ALIVE) == 0) {
    return culled();
  }

  // --- 1. Q16.16 -> float --------------------------------------------------
  let p4 = vec4<f32>(
    f32(world[base + OFFSET_POS_X])     / FIXED_SCALE,
    f32(world[base + OFFSET_POS_X + 1u]) / FIXED_SCALE,
    f32(world[base + OFFSET_POS_X + 2u]) / FIXED_SCALE,
    f32(world[base + OFFSET_POS_X + 3u]) / FIXED_SCALE,
  );

  // --- 2. rotate in R^4 ----------------------------------------------------
  // Six planes, not three axes. Turning the xw or yw dial is what makes the
  // fourth dimension observable: it swings extent that was hidden along w into
  // x or y, where the eye can see it.
  let r4 = camera.rot4 * p4;

  // --- 3. collapse w -------------------------------------------------------
  var p3: vec3<f32>;
  if (camera.mode < 0.5) {
    // Perspective divide along w — the 4D analogue of a 3D camera's divide by z.
    // Points at or behind the viewer's w plane are near-clipped.
    let depth = camera.viewerW - r4.w;
    if (depth <= 0.001) {
      return culled();
    }
    p3 = r4.xyz * (camera.viewerW / depth);
  } else {
    // Cross-section at w = sliceW: show only what currently intersects that
    // hyperplane, the way a 2D being sees a 3D object passing through its plane.
    if (abs(r4.w - camera.sliceW) > camera.sliceThickness) {
      return culled();
    }
    p3 = r4.xyz;
  }

  // --- 4. orbit camera, then perspective -----------------------------------
  let cy = cos(camera.yaw);   let sy = sin(camera.yaw);
  let cp = cos(camera.pitch); let sp = sin(camera.pitch);

  let yawed = vec3<f32>(cy * p3.x + sy * p3.z, p3.y, -sy * p3.x + cy * p3.z);
  var view = vec3<f32>(yawed.x, cp * yawed.y - sp * yawed.z, sp * yawed.y + cp * yawed.z);
  view.z = view.z + camera.distance;

  if (view.z <= 0.01) {
    return culled();
  }

  let focal = 1.0 / tan(0.5 * 1.05);   // ~60 degree vertical field of view
  var clip = vec4<f32>(
    view.x * focal / camera.aspect,
    view.y * focal,
    view.z * 0.001,
    view.z,
  );

  // --- 5. expand to a screen-facing quad -----------------------------------
  // pointSize is a radius in WORLD units. The offset is applied in clip space and
  // scaled by focal length only — the perspective divide by w that happens after
  // this shader is what shrinks distant particles. Dividing by view.z here as
  // well would apply the falloff twice, and multiplying the result back by
  // clip.w (which IS view.z) cancels it entirely, leaving pointSize as a raw
  // clip-space offset that covers most of the screen.
  let corner = quadCorner(vertexIndex);
  clip.x = clip.x + corner.x * camera.pointSize * focal / camera.aspect;
  clip.y = clip.y + corner.y * camera.pointSize * focal;

  var out: VertexOut;
  out.clip = clip;
  out.quadUV = corner;

  // Colour encodes w — position in the fourth dimension. Without this the whole
  // scene collapses into an indistinguishable 3D cloud and the one thing that
  // makes this engine interesting becomes invisible.
  let wNorm = clamp((r4.w - camera.wMin) / max(camera.wMax - camera.wMin, 0.0001), 0.0, 1.0);
  out.colour = hueToRgb(0.62 - 0.62 * wNorm);

  // Fade with distance so the far side of the cloud recedes.
  out.fade = clamp(1.4 - view.z / max(camera.distance * 2.0, 1.0), 0.15, 1.0);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
  // Round the quad into a soft disc; a square blob reads as a bug.
  let d = length(in.quadUV);
  if (d > 1.0) {
    discard;
  }
  let edge = smoothstep(1.0, 0.35, d);
  return vec4<f32>(in.colour * in.fade, edge * in.fade);
}
