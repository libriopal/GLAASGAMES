// scripts/build-app-assets.mjs — stages everything the APK ships.
//
// The output of this script IS the app: android/app/src/main/assets is a
// verbatim copy of it, served inside the APK over
// https://appassets.androidplatform.net/ by WebViewAssetLoader. Nothing is
// fetched from the network at runtime, which is why the manifest asks for no
// INTERNET permission at all.
//
// Testing the staged tree rather than the repo layout matters: the relative
// paths in app.html only resolve correctly once the files sit where the APK puts
// them, so a test against the source tree would be testing a layout that never
// ships.
//
//   node scripts/build-app-assets.mjs [outDir]
//
// Run `npm run build:web` first; this copies emitted JavaScript, it does not
// compile any.

import { cp, mkdir, rm, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'build', 'app-assets'));

async function totalBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? await totalBytes(path) : (await stat(path)).size;
  }
  return total;
}

/** Strips sourceMappingURL comments: the .map files are not shipped, and a
 *  dangling reference makes every load emit a console error on the device. */
async function stripSourceMaps(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await stripSourceMaps(path);
    } else if (entry.name.endsWith('.js')) {
      const text = await readFile(path, 'utf8');
      const stripped = text.replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd() + '\n';
      if (stripped !== text) await writeFile(path, stripped);
    } else if (entry.name.endsWith('.map')) {
      await rm(path);
    }
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// The compiled host. tsc emits with rootDir "..", so web/dist already contains
// the web/ and engine/ trees in the shape app.js imports them.
await cp(join(root, 'web', 'dist'), join(out, 'dist'), { recursive: true });
await stripSourceMaps(join(out, 'dist'));

// The simulation config, fetched at startup. It stays a JSON file rather than
// being inlined so the config the phone runs is byte-identical to the one CI
// verifies against.
await mkdir(join(out, 'engine', 'config'), { recursive: true });
await cp(
  join(root, 'engine', 'config', 'sim.json'),
  join(out, 'engine', 'config', 'sim.json'),
);

// app.html becomes index.html: WebViewAssetLoader serves a directory index and
// the Android host loads the assets root.
await cp(join(root, 'web', 'app.html'), join(out, 'index.html'));

// Neither WebGPU entry point is shipped. Both need an adapter that a WebView
// does not provide, so both would fail on every device that installs this, and
// an entry point that always fails is worse than an absent one. parity.js is
// here for the same reason main.js is: it was added later, and this list is the
// kind that silently goes stale, so it is asserted below rather than trusted.
const WEBGPU_ONLY = ['main.js', 'parity.js'];
for (const name of WEBGPU_ONLY) {
  await rm(join(out, 'dist', 'web', name), { force: true });
}

// Nothing that reaches for WebGPU may survive into the bundle. A grep is a
// blunt check, but it fails loudly when someone adds a third WebGPU entry point
// and forgets this list — which is exactly how main.js came to be handled and
// parity.js did not.
for (const entry of await readdir(join(out, 'dist', 'web'))) {
  if (!entry.endsWith('.js')) continue;
  const text = await readFile(join(out, 'dist', 'web', entry), 'utf8');
  if (/navigator\s*\.\s*gpu|requestAdapter/.test(text)) {
    throw new Error(
      `${entry} reaches for WebGPU but is being staged into the APK, where no ` +
      `adapter exists. Add it to WEBGPU_ONLY in this script, or make it degrade.`,
    );
  }
}

const bytes = await totalBytes(out);
console.log(`app assets staged at ${relative(root, out)} — ${(bytes / 1024).toFixed(0)} KB`);
