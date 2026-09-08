// engine/sim/daily.ts — the same world for everyone, every day.
//
// WHY THIS IS THE RETENTION MECHANIC, AND WHY IT IS THE ONLY ONE ALLOWED HERE:
// this repository's governance suite fails the build on dark patterns, loss
// framing, artificial scarcity timers, streak punishment and non-graceful
// session ends (game/economy/rules.ts). That rules out essentially the entire
// standard mobile retention playbook. What it does not rule out is giving people
// a reason to come back that is worth coming back for.
//
// The reason here is fairness. Everyone gets the identical world, derived from
// the date by integer arithmetic; every run is a replay that anybody can
// recompute; so a score is a claim that can be checked rather than a number a
// server asserts. The design leans on the self-determination finding that
// survived falsification — autonomy and competence predict both enjoyment and
// future play — rather than on challenge-skill balance and dynamic difficulty
// adjustment, which did not survive (pre-registered null result).
//
// WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN:
//   - a streak counter, or any state that grows with consecutive days
//   - a countdown, an expiry, or anything that makes a day's puzzle unavailable
//   - any notion of a day being "missed"
// Yesterday's seed is computable forever. Miss a week and nothing is lost,
// because there is nothing to lose. That is not an oversight; verify-daily.ts
// asserts it, and this comment is the specification the assertion checks.

/** A calendar day in UTC. UTC and not local time, so two people in different
 *  time zones comparing scores are talking about the same world. */
export interface UtcDay {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  /** 1-31. */
  readonly day: number;
}

/** Reads the UTC day out of a timestamp. */
export function utcDayOf(when: Date): UtcDay {
  return {
    year: when.getUTCFullYear(),
    month: when.getUTCMonth() + 1,
    day: when.getUTCDate(),
  };
}

/** `YYYY-MM-DD`, the form shown to a player and used to name a replay. */
export function formatUtcDay(day: UtcDay): string {
  const mm = String(day.month).padStart(2, '0');
  const dd = String(day.day).padStart(2, '0');
  return `${day.year}-${mm}-${dd}`;
}

export function parseUtcDay(text: string): UtcDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`not a YYYY-MM-DD date: ${text}`);
  const [, y, m, d] = match;
  const day = { year: Number(y), month: Number(m), day: Number(d) };
  if (day.month < 1 || day.month > 12 || day.day < 1 || day.day > 31) {
    throw new Error(`date out of range: ${text}`);
  }
  return day;
}

/**
 * Derives the world seed for a day.
 *
 * Integer only, and avalanching: consecutive days must not produce nearby
 * seeds, or consecutive days would produce recognisably similar worlds and the
 * puzzle would go stale in a week. The mixer is the finaliser from MurmurHash3,
 * used here for its bit diffusion rather than for any hashing property.
 */
export function seedForDay(day: UtcDay): number {
  // A single ordinal, so that 2026-12-31 and 2027-01-01 are adjacent inputs and
  // the avalanche has something to work on.
  let hash = (day.year * 10000 + day.month * 100 + day.day) | 0;
  hash = (hash ^ (hash >>> 16)) | 0;
  hash = Math.imul(hash, 0x85ebca6b) | 0;
  hash = (hash ^ (hash >>> 13)) | 0;
  hash = Math.imul(hash, 0xc2b2ae35) | 0;
  hash = (hash ^ (hash >>> 16)) | 0;
  // The world generator treats 0 as "unseeded" and substitutes a constant;
  // returning it here would make one day in roughly four billion silently share
  // a world with the default.
  return hash === 0 ? 0x1a2b3c4d : hash;
}

/** The seed for today's puzzle. */
export function seedForToday(now: Date = new Date()): number {
  return seedForDay(utcDayOf(now));
}

/**
 * How many drifters populate a day's world.
 *
 * Derived from the seed rather than fixed, so the visual density varies, but
 * clamped to a band: this is scenery, and letting it reach zero or the pool
 * limit would change how hard the puzzle is to read rather than how hard it is
 * to solve. Difficulty is not adjusted per player — that is the falsified idea.
 */
export function driftersForSeed(seed: number, capacity: number, targets: number): number {
  const headroom = Math.max(0, capacity - targets - 1);
  const band = Math.min(headroom, 2400);
  const low = Math.min(headroom, 800);
  if (band <= low) return low;
  return low + (Math.abs(seed) % (band - low));
}
