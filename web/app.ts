// web/app.ts — the host that ships in the APK.
//
// TWO HOSTS, ONE ENGINE. web/main.ts keeps the world in VRAM and advances it
// with compute dispatches; it needs WebGPU and it runs on desktop and in Chrome
// for Android. This host simulates on the CPU with the reference executor and
// draws with WebGL2, because Android's WebView — what an installed APK actually
// renders with — does not expose WebGPU.
//
// That split is not a compromise on determinism, it is the strongest position
// available. kernel.ts IS the semantic definition of the simulation; sim.wgsl is
// a port that CI proves bit-identical to it. So the phone runs the definition,
// and the digest it produces is the reference digest by construction. Nothing
// about a run's outcome depends on the device's GPU.
//
// The app is entirely offline: no network permission, no fetch beyond the
// bundled assets, no account, no telemetry. That is a product decision first —
// the daily puzzle is derived from the date by arithmetic, so there is nothing
// to download — and it happens to also be the cleanest possible answer to Play's
// Data Safety form.

import { orientationToMatrix, type Orientation4 } from '../engine/math/rotor4.js';
import { parseSimConfig, type RawConfig, type SimConfig } from '../engine/sim/config-parse.js';
import {
  driftersForSeed,
  formatUtcDay,
  seedForDay,
  utcDayOf,
} from '../engine/sim/daily.js';
import { Game, type Input, nearestTarget } from '../engine/sim/game.js';
import { formatHash, TickHashChain } from '../engine/sim/hash.js';
import { tick } from '../engine/sim/kernel.js';
import { ReplayRecorder, verifyReplay } from '../engine/sim/replay.js';
import { WorldState, writePlayerPosition } from '../engine/sim/state.js';
import { populate } from '../engine/sim/world-gen.js';
import { FixedTimestep } from '../engine/host/loop.js';
import {
  computeControlLayout,
  type ControlLayout,
  stickInput,
  type Viewport,
} from './controls-layout.js';
import { Gl2Renderer } from './gl2-renderer.js';

const FIXED_ONE = 65536;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing element #${id}`);
  return found as T;
}

function setText(id: string, text: string): void {
  const node = document.getElementById(id);
  if (node !== null) node.textContent = text;
}

function fatal(title: string, detail: string): never {
  const panel = document.getElementById('fatal');
  if (panel !== null) {
    panel.style.display = 'block';
    panel.innerHTML = '';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const body = document.createElement('pre');
    body.textContent = detail;
    panel.append(heading, body);
  }
  throw new Error(`${title}: ${detail}`);
}

async function main(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('view');

  // `alpha: false` and no depth buffer: this is an additive particle pass over
  // an opaque black ground, and asking for buffers nothing reads costs fill
  // rate on exactly the low-end hardware this build targets.
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (gl === null) {
    fatal('WebGL2 unavailable',
      'This device\'s browser did not provide a WebGL2 context. The game needs ' +
      'WebGL2 to draw. On Android this usually means the System WebView is ' +
      'severely out of date — updating Android System WebView in the Play Store ' +
      'normally resolves it.');
  }

  const configResponse = await fetch('./engine/config/sim.json');
  if (!configResponse.ok) fatal('Missing sim.json', `HTTP ${configResponse.status}`);
  const config: SimConfig = parseSimConfig((await configResponse.json()) as RawConfig);

  // --- The day's world ------------------------------------------------------
  const today = utcDayOf(new Date());
  const seed = seedForDay(today);
  const drifters = driftersForSeed(seed, config.capacity, config.targetCount);

  const world = new WorldState(config.capacity);
  const playerSlot = populate(world, config, seed, drifters);

  const game = new Game(config);
  game.begin(world);

  const recorder = new ReplayRecorder(seed, drifters, config.capacity);
  const chain = new TickHashChain();

  const renderer = new Gl2Renderer(gl, config.capacity);

  setText('day', formatUtcDay(today));
  setText('seed', String(seed));
  setText('entities', String(world.count));

  // --- Camera ---------------------------------------------------------------
  const camera = {
    yaw: 0.6,
    pitch: 0.25,
    distance: 150,
    orientation: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
    autoSpin: true,
    mode: config.renderMode,
  };
  const rot4 = new Float32Array(16);

  // --- Controls -------------------------------------------------------------
  // Layout comes from the pure function that verify-controls checks headlessly,
  // so what ships is what was verified rather than a second implementation of
  // the same intent.
  let layout: ControlLayout = computeControlLayout(currentViewport());
  const held = { rise: false, fall: false, ana: false, kata: false };
  let stickOrigin: { x: number; y: number } | null = null;
  let stickAt = { x: 0, y: 0 };
  let stickPointer = -1;

  function currentViewport(): Viewport {
    const style = getComputedStyle(document.documentElement);
    const inset = (name: string): number =>
      Number.parseFloat(style.getPropertyValue(name)) || 0;
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pxPerDp: 1,
      safeTop: inset('--safe-top'),
      safeBottom: inset('--safe-bottom'),
      safeLeft: inset('--safe-left'),
      safeRight: inset('--safe-right'),
    };
  }

  const buttonNodes = new Map<string, HTMLElement>([
    ['ana', element('btn-ana')],
    ['kata', element('btn-kata')],
    ['rise', element('btn-rise')],
    ['fall', element('btn-fall')],
  ]);
  const stickNode = element('stick');
  const stickNub = element('stick-nub');

  function applyLayout(): void {
    layout = computeControlLayout(currentViewport());
    for (const rect of layout.buttons) {
      const node = buttonNodes.get(rect.id);
      if (node === undefined) continue;
      node.style.left = `${rect.x}px`;
      node.style.top = `${rect.y}px`;
      node.style.width = `${rect.width}px`;
      node.style.height = `${rect.height}px`;
    }
    const zone = layout.stickZone;
    stickNode.style.left = `${zone.x}px`;
    stickNode.style.top = `${zone.y}px`;
    stickNode.style.width = `${zone.width}px`;
    stickNode.style.height = `${zone.height}px`;
  }
  applyLayout();
  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', applyLayout);

  // Pointer Events only. Touch Events would fire alongside them and double every
  // press; there is no Touch Events listener anywhere in this host, deliberately.
  for (const [id, node] of buttonNodes) {
    const key = id as keyof typeof held;
    const press = (on: boolean) => (event: Event): void => {
      held[key] = on;
      event.preventDefault();
    };
    node.addEventListener('pointerdown', press(true));
    node.addEventListener('pointerup', press(false));
    node.addEventListener('pointerleave', press(false));
    node.addEventListener('pointercancel', press(false));
  }

  stickNode.addEventListener('pointerdown', (event) => {
    stickPointer = event.pointerId;
    stickNode.setPointerCapture(event.pointerId);
    stickOrigin = { x: event.clientX, y: event.clientY };
    stickAt = { ...stickOrigin };
    stickNub.style.opacity = '1';
    event.preventDefault();
  });
  stickNode.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer || stickOrigin === null) return;
    stickAt = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });
  const releaseStick = (event: PointerEvent): void => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = -1;
    stickOrigin = null;
    stickNub.style.opacity = '0';
  };
  stickNode.addEventListener('pointerup', releaseStick);
  stickNode.addEventListener('pointercancel', releaseStick);

  // Dragging on the canvas orbits the camera. Two fingers pinch to zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  const dropPointer = (event: PointerEvent): void => void pointers.delete(event.pointerId);
  canvas.addEventListener('pointerup', dropPointer);
  canvas.addEventListener('pointercancel', dropPointer);
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      camera.yaw -= dx * 0.006;
      camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.006));
      camera.autoSpin = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchStart > 0) {
        camera.distance = Math.max(20, Math.min(600, camera.distance * (pinchStart / spread)));
      }
      pinchStart = spread;
    }
  });

  element('btn-spin').addEventListener('click', () => {
    camera.autoSpin = !camera.autoSpin;
  });
  element('btn-mode').addEventListener('click', () => {
    camera.mode = camera.mode === 'project' ? 'slice' : 'project';
    setText('mode', camera.mode);
  });
  setText('mode', camera.mode);

  const currentInput = (): Input => {
    const stick = stickOrigin === null
      ? { x: 0, z: 0 }
      : stickInput(stickOrigin, stickAt, layout.stickRadius);
    return {
      x: stick.x,
      y: (held.rise ? FIXED_ONE : 0) - (held.fall ? FIXED_ONE : 0),
      z: stick.z,
      w: (held.ana ? FIXED_ONE : 0) - (held.kata ? FIXED_ONE : 0),
    };
  };

  // --- Finishing a run ------------------------------------------------------
  // The session ends gracefully and on the player's terms: the run is verified
  // in front of them, the digest is shown, and nothing is taken away. There is
  // no timer, no "come back tomorrow or lose it", and yesterday's puzzle is
  // still computable. The governance suite fails the build over exactly those
  // patterns, and this is the screen where a lesser design would have added one.
  let finished = false;
  function finish(): void {
    if (finished) return;
    finished = true;

    const state = game.state;
    const replay = recorder.finish({
      collected: state.collected,
      total: state.total,
      ticks: state.ticks,
      phase: state.phase,
      digest: chain.digest,
    });

    const verdict = verifyReplay(replay, config);
    const panel = element('done');
    panel.style.display = 'flex';
    setText('done-title', state.phase === 'won' ? 'Cleared' : 'Run complete');
    setText('done-score', `${state.collected} of ${state.total}`);
    setText('done-time', `${(state.ticks / config.tickHz).toFixed(1)}s`);
    setText('done-digest', formatHash(replay.claimed.digest));
    setText('done-verdict', verdict.ok
      ? 'verified — this run recomputes exactly'
      : `NOT VERIFIED: ${verdict.mismatches.join('; ')}`);

    element('btn-copy').addEventListener('click', () => {
      const text = JSON.stringify(replay);
      void navigator.clipboard?.writeText(text).then(
        () => setText('done-verdict', 'replay copied — anyone can recompute it'),
        () => setText('done-verdict', 'could not copy; the digest above is the proof'),
      );
    });
  }

  element('btn-finish').addEventListener('click', finish);

  // --- Loop -----------------------------------------------------------------
  const timestep = new FixedTimestep(config);
  let frames = 0;
  let lastFpsAt = performance.now();

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const frame = (now: number): void => {
    resize();

    const step = timestep.advance(now);
    if (step.ticks > 0 && !finished) {
      const input = currentInput();
      for (let i = 0; i < step.ticks; i += 1) {
        if (game.state.phase !== 'playing') break;
        // Game before simulation, and the player's record written between the
        // two: the same order the replay executor uses, because a host that
        // ordered these differently would produce runs its own verifier rejects.
        game.advance(world, input);
        recorder.push(input);
        const player = game.state.player;
        writePlayerPosition(world, playerSlot, player);
        tick(world, config, player);
        chain.push(world.buffer);
      }
      if (game.state.phase === 'won') finish();
    }

    if (camera.autoSpin) {
      // Turning the xw and yw dials is what makes the fourth dimension
      // observable: it swings extent hidden along w into x or y, where the eye
      // can see it.
      camera.orientation[2] = (camera.orientation[2] + 260) | 0;
      camera.orientation[4] = (camera.orientation[4] + 170) | 0;
    }
    const fixedMatrix = orientationToMatrix(camera.orientation as unknown as Orientation4);
    for (let i = 0; i < 16; i += 1) rot4[i] = fixedMatrix[i]! / FIXED_ONE;

    const state = game.state;
    renderer.draw(world.buffer, world.capacity, {
      rot4,
      viewerW: config.viewerW / FIXED_ONE,
      sliceW: state.player.w / FIXED_ONE,
      sliceThickness: config.sliceThickness / FIXED_ONE,
      mode: camera.mode,
      yaw: camera.yaw,
      pitch: camera.pitch,
      distance: camera.distance,
      pointSize: 0.55,
      wMin: config.boundsMin.w / FIXED_ONE,
      wMax: config.boundsMax.w / FIXED_ONE,
    }, canvas.width, canvas.height);

    frames += 1;
    if (now - lastFpsAt >= 500) {
      setText('fps', (frames * 1000 / (now - lastFpsAt)).toFixed(0));
      frames = 0;
      lastFpsAt = now;
      setText('score', `${state.collected}/${state.total}`);
      setText('clock', `${(state.ticks / config.tickHz).toFixed(1)}s`);
      setText('playerw', (state.player.w / FIXED_ONE).toFixed(2));
      const near = nearestTarget(world, state.player);
      setText('nearest', near === null
        ? '—'
        : `${near.spatial.toFixed(1)} away, ${near.alongW >= 0 ? '+' : ''}${near.alongW.toFixed(1)} in w`);
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  fatal('Failed to start', error instanceof Error ? (error.stack ?? error.message) : String(error));
});
