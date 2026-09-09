// web/feedback.ts — sound and touch, under one rule that decides every choice
// in this file.
//
//   ANTICIPATION BEFORE THE COMMIT. INSTANT RESOLUTION AFTER.
//
// This is not a style preference. A slot machine stretches the moment AFTER the
// outcome is already fixed — the reels have decided, and the near-miss is
// theatre played to a result that cannot change. That is the dark pattern, and
// the whole of `fourd-as-the-board.md` change 4 is the ethical inversion of it:
// build tension WHILE the player is still choosing, when the tension is real,
// and once they commit, show them what happened immediately.
//
// So: the press builds a tone while the player is holding a cell and can still
// change their mind, and the release resolves with a single short tick and no
// suspense whatsoever. `verify-feedback` B2 measures the gap between the tap and
// the score changing on screen and fails the build if any animation, transition
// or await gets between them.
//
// WHY THERE ARE NO AUDIO FILES. Every sound here is synthesised from an
// oscillator and a gain envelope. A .mp3 would be a network-free asset too, but
// it would also be bytes in the APK, a decode on first play, and a thing that
// cannot be inspected by an oracle. A waveform described in code can be.
//
// NOTHING HERE MAY THROW INTO THE GAME. A WebView with audio blocked, a device
// with no vibrator, a browser that refuses an AudioContext before a gesture —
// all of them are ordinary, and none of them is a reason a round should fail.
// Every entry point is wrapped, and B4 plants a broken AudioContext to prove a
// silent game is still a playable one.

const MUTE_KEY = 'glaas.lattice.mute.v1';

/** Reads the persisted preference without letting storage failure matter. */
function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export class Feedback {
  #ctx: AudioContext | null = null;
  #muted = loadMuted();
  /** The anticipation voice, alive only while a cell is held. */
  #holding: { osc: OscillatorNode; gain: GainNode } | null = null;

  get muted(): boolean {
    return this.#muted;
  }

  setMuted(value: boolean): void {
    this.#muted = value;
    if (value) this.release();
    try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* nothing to remember with */ }
  }

  /**
   * The audio context, made on first use and never before.
   *
   * A context constructed at load is created `suspended` by every mobile engine
   * and stays that way until a gesture, so building it lazily inside a gesture
   * is not an optimisation — it is the only ordering that produces sound.
   */
  #audio(): AudioContext | null {
    if (this.#muted) return null;
    try {
      this.#ctx ??= new (globalThis.AudioContext ?? (globalThis as unknown as {
        webkitAudioContext: typeof AudioContext;
      }).webkitAudioContext)();
      if (this.#ctx.state === 'suspended') void this.#ctx.resume();
      return this.#ctx;
    } catch {
      return null;
    }
  }

  /**
   * Begins the anticipation tone. Called on press, while the choice is still
   * the player's to change.
   *
   * `weight` is how charged the cell under the finger is, 0..1. A more charged
   * cell sits higher, so the tension the player hears is information about the
   * board rather than decoration on top of it.
   */
  anticipate(weight: number): void {
    const ctx = this.#audio();
    if (!ctx) return;
    this.release();
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const base = 180 + Math.max(0, Math.min(1, weight)) * 220;
      osc.frequency.setValueAtTime(base, ctx.currentTime);
      // Rising while held: the tension is the holding, and it stops the instant
      // the finger leaves.
      osc.frequency.linearRampToValueAtTime(base * 1.25, ctx.currentTime + 0.9);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this.#holding = { osc, gain };
    } catch { /* no anticipation on this device; the game is unaffected */ }
  }

  /** Ends the anticipation tone without resolving anything. */
  release(): void {
    const held = this.#holding;
    this.#holding = null;
    if (!held || !this.#ctx) return;
    try {
      const now = this.#ctx.currentTime;
      held.gain.gain.cancelScheduledValues(now);
      held.gain.gain.setValueAtTime(held.gain.gain.value, now);
      held.gain.gain.linearRampToValueAtTime(0, now + 0.04);
      held.osc.stop(now + 0.05);
    } catch { /* already gone */ }
  }

  /**
   * The resolution. One tick, 60 milliseconds, no rise and no tail.
   *
   * CALL THIS AFTER THE SCREEN HAS BEEN UPDATED, NEVER BEFORE. The rule is that
   * nothing delays an outcome that is already decided, and the cheapest way to
   * break it is to make the render wait on a sound. `verify-feedback` B2
   * measures the click-to-repaint gap and B3 forbids a transition on the score,
   * so this ordering is enforced rather than remembered.
   */
  commit(): void {
    this.release();
    // The haptic tick first: it is a single call to the platform, it cannot
    // block, and on a phone it is the part the player actually feels.
    try { navigator.vibrate?.(8); } catch { /* no vibrator, or no permission */ }
    const ctx = this.#audio();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch { /* silent commit */ }
  }

  /** The round is over. Two ticks, still no suspense. */
  finish(): void {
    this.release();
    try { navigator.vibrate?.([12, 40, 20]); } catch { /* no vibrator */ }
    const ctx = this.#audio();
    if (!ctx) return;
    try {
      for (const [i, hz] of [440, 660].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const at = ctx.currentTime + i * 0.09;
        osc.frequency.setValueAtTime(hz, at);
        gain.gain.setValueAtTime(0.05, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.13);
      }
    } catch { /* silent finish */ }
  }
}
