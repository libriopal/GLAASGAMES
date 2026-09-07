// engine/sim/config.ts — Node-side loader for engine/config/sim.json.
//
// This file is the ONLY thing separating the Node host from the browser host:
// all validation and fixed-point conversion lives in config-parse.ts, which
// imports nothing from node: and is therefore loadable in a browser. The browser
// fetches sim.json and calls parseSimConfig directly; Node reads it from disk and
// calls the same function. One parser, two hosts — a config that validates on the
// phone validates in CI, necessarily rather than by convention.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSimConfig, type RawConfig } from './config-parse.js';

export {
  packConfigForGpu,
  parseSimConfig,
  type FixedVec4Config,
  type RawConfig,
  type SimConfig,
} from './config-parse.js';

/** Reads sim.json from disk and validates it. Node only. */
export function loadSimConfig(path?: string): ReturnType<typeof parseSimConfig> {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = path ?? join(here, '..', 'config', 'sim.json');

  let raw: RawConfig;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8')) as RawConfig;
  } catch (cause) {
    throw new Error(`sim.json: could not read or parse ${configPath}: ${String(cause)}`);
  }

  return parseSimConfig(raw);
}
