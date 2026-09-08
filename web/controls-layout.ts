// web/controls-layout.ts — where the controls go, as arithmetic.
//
// This is deliberately a pure function of the viewport with no DOM in it, so the
// layout can be checked headlessly across a matrix of real phone sizes. A
// control scheme that is only ever verified by looking at it on one device is
// verified on one device.
//
// THE CONSTRAINTS, AND WHERE THEY COME FROM:
//
//   Touch target size. Material Design specifies 48dp; Apple's HIG specifies
//   44pt; the measurement literature on thumb input puts the error-minimising
//   size nearer 9.2mm, which is about 58dp at baseline density, and higher for
//   densely packed controls. We take 60dp, above all three, because this is a
//   game where a missed input is a lost run and there is no undo.
//
//   Screen edges belong to the system. The Android back gesture claims a strip
//   on BOTH the left and right edges — it is not configurable per-app from the
//   web, because setSystemGestureExclusionRects is a native View API with no web
//   equivalent. A control inside that strip does not merely overlap the gesture;
//   it loses to it. So everything is inset, and the inset is 32dp rather than
//   the ~24dp the gesture strip typically occupies, because a control whose edge
//   exactly abuts the strip is still hit by the fat part of a thumb.
//
//   Thumbs, not cursors. Roughly half of phone use is one-handed and about
//   two-thirds of those are right-thumbed. A fixed stick therefore sits wrong
//   for most people most of the time, which is why the movement control here is
//   a FLOATING stick: it appears centred on wherever the thumb first lands
//   inside its zone. Nothing to reach for means nothing to reach for wrongly.
//
//   Safe areas. Notches, punch-holes and the gesture pill are reported by
//   env(safe-area-inset-*); they are passed in here rather than assumed, since
//   they differ per device and per orientation.

/** Density-independent pixels. */
export type Dp = number;

export const MIN_TARGET_DP: Dp = 60;
export const EDGE_INSET_DP: Dp = 32;

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** devicePixelRatio-independent scale: CSS px per dp. 1 on a baseline device. */
  readonly pxPerDp: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly safeRight: number;
}

export interface Rect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ControlLayout {
  /** The region inside which a touch summons the floating movement stick. */
  readonly stickZone: Rect;
  /** Radius the stick travels before reading as full deflection, in CSS px. */
  readonly stickRadius: number;
  /** Fixed buttons: the w axis and the vertical axis. */
  readonly buttons: readonly Rect[];
  /** True when the viewport is too small to honour the constraints. */
  readonly degraded: boolean;
}

/**
 * Lays the controls out for a viewport.
 *
 * The stick zone takes the lower-left, the buttons the lower-right, because a
 * right thumb reaches the right side and a left hand cradling the phone reaches
 * the left. Neither region touches a screen edge.
 */
export function computeControlLayout(view: Viewport): ControlLayout {
  const dp = (value: Dp): number => value * view.pxPerDp;

  const inset = dp(EDGE_INSET_DP);
  const left = Math.max(inset, view.safeLeft + inset);
  const right = Math.max(inset, view.safeRight + inset);
  const bottom = Math.max(inset, view.safeBottom + inset);

  const usableWidth = view.width - left - right;
  const target = dp(MIN_TARGET_DP);
  const gap = dp(8);

  // The w cluster is the mechanic, so it gets a full 2x2 of large targets: ana,
  // kata, and the two vertical directions.
  const clusterWidth = target * 2 + gap;
  const clusterHeight = target * 2 + gap;

  const clusterX = view.width - right - clusterWidth;
  const clusterY = view.height - bottom - clusterHeight;

  const buttons: Rect[] = [
    { id: 'ana', x: clusterX, y: clusterY, width: target, height: target },
    { id: 'rise', x: clusterX + target + gap, y: clusterY, width: target, height: target },
    { id: 'kata', x: clusterX, y: clusterY + target + gap, width: target, height: target },
    { id: 'fall', x: clusterX + target + gap, y: clusterY + target + gap, width: target, height: target },
  ];

  // The stick zone fills what is left on the bottom-left, capped so it never
  // runs under the cluster.
  const zoneWidth = Math.max(dp(96), Math.min(clusterX - left - gap, usableWidth * 0.55));
  const zoneHeight = Math.max(dp(96), Math.min(clusterHeight + dp(40), view.height * 0.4));
  const stickZone: Rect = {
    id: 'stick',
    x: left,
    y: view.height - bottom - zoneHeight,
    width: zoneWidth,
    height: zoneHeight,
  };

  const degraded =
    usableWidth < clusterWidth + dp(96) + gap ||
    view.height - bottom - clusterHeight < dp(120);

  return {
    stickZone,
    stickRadius: dp(44),
    buttons,
    degraded,
  };
}

/** Every interactive rect, for checking. */
export function allTargets(layout: ControlLayout): readonly Rect[] {
  return [layout.stickZone, ...layout.buttons];
}

/**
 * Converts a touch inside the stick zone into a Q16.16 direction.
 *
 * `origin` is where the thumb first landed — the stick's centre for this
 * gesture. Deflection is clamped to the unit square rather than the unit circle
 * because the simulation clamps each axis independently, and a circular clamp
 * here would silently cost the player diagonal speed the rules do allow.
 */
export function stickInput(
  origin: { readonly x: number; readonly y: number },
  at: { readonly x: number; readonly y: number },
  radius: number,
): { readonly x: number; readonly z: number } {
  const FIXED_ONE = 65536;
  const clamp = (value: number): number =>
    value < -FIXED_ONE ? -FIXED_ONE : value > FIXED_ONE ? FIXED_ONE : value;
  const scale = radius <= 0 ? 0 : FIXED_ONE / radius;
  return {
    x: clamp(Math.round((at.x - origin.x) * scale)),
    // Screen y grows downward; pushing the stick up must move the player away
    // from the camera, which is -z.
    z: clamp(Math.round((at.y - origin.y) * scale)),
  };
}
