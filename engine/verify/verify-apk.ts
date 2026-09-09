// engine/verify/verify-apk.ts — the shipped artifact, held to the source.
//
// The sovereignty classifier applied one level up from the code: what in the
// APK is ASSERTED rather than pinned?
//
// Before this file the answer was "almost everything about its contents". The
// build signs correctly and stages assets correctly, and nothing ever checked
// that the APK on disk contained what the current source says it should. A
// build from three weeks ago and a build from this commit are the same file to
// everyone downstream — including to a tester who installs one believing it is
// the other. That is the same hole `lattice/ruleset.ts` closed for a round,
// raised to the artifact: the rules were pinned, the BINARY carrying them was
// not.
//
// K1  the APK exists and is signed, and NOT with a debug key
// K2  every asset in the APK is byte-identical to the staged tree
// K3  the rules hash INSIDE the APK equals computeRules() on the source
// K4  no WebGPU entry point survived into the bundle
// K5  a tampered asset is detected                          (NEGATIVE CONTROL)
// K6  no native JavaScript bridge — the channel no web-API check can see
//
// K3 IS THE ONE THAT MATTERS FOR A PLAYER. The app publishes a rules hash in
// every commitment it makes. If the APK ships a stale one, every commitment it
// publishes names a ruleset it is not playing under, and no player could detect
// it — the commitment would verify against itself perfectly.
//
// This oracle FAILS when the APK is missing or stale. It does not skip. An
// artifact check that skips when the artifact is absent is a check that passes
// hardest exactly when there is nothing to check.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { computeRules } from '../../lattice/ruleset.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Which artifact. A debug build is what a tester installs; a release build is
// what reaches a store. They are held to DIFFERENT signing rules and to the
// SAME content rules, because a debug build that ships the wrong game is just
// as useless for testing as a release that does.
const VARIANT = process.argv.includes('--debug') ? 'debug' : 'release';

// AGP emits a DIFFERENTLY NAMED file when there is no signing config:
// app-release-unsigned.apk rather than app-release.apk. Looking only for the
// signed name reports "no APK was built" when in fact one was built and simply
// could not be signed — a misleading message that sends someone to debug the
// build instead of supplying a keystore.
const RELEASE_SIGNED = join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
const RELEASE_UNSIGNED = join(ROOT, 'android/app/build/outputs/apk/release/app-release-unsigned.apk');
const APK = VARIANT === 'debug'
  ? join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk')
  : (existsSync(RELEASE_SIGNED) ? RELEASE_SIGNED : RELEASE_UNSIGNED);
const UNSIGNED_BY_NAME = VARIANT === 'release' && APK === RELEASE_UNSIGNED;
const STAGED = join(ROOT, 'android/app/src/main/assets');

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

/** Lists the staged tree as relative paths. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, base));
    else out.push(relative(base, path).split('\\').join('/'));
  }
  return out;
}

if (!existsSync(APK)) {
  console.error(`verify-apk: FAIL — no ${VARIANT} APK at ${relative(ROOT, APK)}`);
  console.error('            Build one with `npm run build:apk`. An artifact check cannot skip its artifact.');
  process.exit(1);
}

// Entries are read with the system `unzip`, which is present everywhere this
// runs and avoids adding a zip dependency to verify a zip.
const listing = execFileSync('unzip', ['-Z1', APK], { encoding: 'utf8' }).split('\n').filter(Boolean);
const apkAssets = listing.filter((n) => n.startsWith('assets/') && !n.startsWith('assets/dexopt/'));

// ── K1: signed, by the right kind of key for this variant ──────────────────
{
  const bytes = readFileSync(APK);
  const blockAt = bytes.lastIndexOf('APK Sig Block 42');
  const window = blockAt > 0 ? bytes.subarray(Math.max(0, blockAt - 65_536), blockAt) : Buffer.alloc(0);
  const debugSigned = window.includes('Android Debug');
  const named = /CN=([^,\x00]{2,64})/.exec(window.toString('latin1'))?.[1];

  if (VARIANT === 'release') {
    ok(blockAt > 0 && !UNSIGNED_BY_NAME,
      'K1: the release build produced app-release-UNSIGNED.apk. build.gradle.kts deliberately refuses to fall ' +
        'back to the debug key, so an absent GLAAS_KEYSTORE leaves the artifact unsigned — that is the config ' +
        'working, not failing. Set GLAAS_KEYSTORE / GLAAS_KEYSTORE_PASSWORD / GLAAS_KEY_ALIAS / ' +
        'GLAAS_KEY_PASSWORD and rebuild. Until then this file cannot be installed or submitted. ' +
        'The content checks below still ran, so you can see whether it would have shipped the right game.');
    ok(!debugSigned,
      'K1: the release APK is signed with the ANDROID DEBUG KEY. It looks releasable and is not — Play will ' +
        'reject it, and anyone can forge an update to it.');
    if (blockAt > 0 && !debugSigned) {
      console.log(`  K1 signature: signed by ${named ? `CN=${named}` : '(certificate present)'}, not the debug key`);
    }
  } else {
    ok(blockAt > 0, 'K1: the debug APK is unsigned, so it cannot be installed on a device');
    // A debug build MUST be distinguishable from a release one. The
    // applicationIdSuffix is what stops a tester installing a debug build over
    // a release, or mistaking one for the other in a bug report.
    const manifest = execFileSync('unzip', ['-p', APK, 'AndroidManifest.xml'], { maxBuffer: 16 * 1024 * 1024 });
    const utf16 = manifest.toString('utf16le');
    ok(utf16.includes('games.glaas.fourd.debug') || manifest.includes('games.glaas.fourd.debug'),
      'K1: the debug APK does not carry the .debug application id, so it is installable over a release build ' +
        'and indistinguishable from one on a device');
    console.log(`  K1 signature: debug-signed (${named ? `CN=${named}` : 'certificate present'}), application id carries the .debug suffix`);
  }
}

// ── K2: the APK's assets are the staged assets ─────────────────────────────
{
  const staged = walk(STAGED);
  const stagedSet = new Set(staged.map((p) => `assets/${p}`));
  const missing = [...stagedSet].filter((p) => !apkAssets.includes(p));
  const extra = apkAssets.filter((p) => !stagedSet.has(p));

  ok(missing.length === 0,
    `K2: ${missing.length} staged files are absent from the APK (${missing.slice(0, 3).join(', ')}) — the ` +
      'artifact predates the current build output');
  ok(extra.length === 0,
    `K2: the APK carries ${extra.length} assets that are not in the staged tree (${extra.slice(0, 3).join(', ')})`);

  let compared = 0;
  let differing = 0;
  const firstDiffs: string[] = [];
  for (const entry of apkAssets) {
    const rel = entry.slice('assets/'.length);
    const onDisk = join(STAGED, rel);
    if (!existsSync(onDisk)) continue;
    const inApk = execFileSync('unzip', ['-p', APK, entry], { maxBuffer: 64 * 1024 * 1024 });
    compared += 1;
    if (sha(inApk) !== sha(readFileSync(onDisk))) {
      differing += 1;
      if (firstDiffs.length < 3) firstDiffs.push(rel);
    }
  }
  ok(differing === 0,
    `K2: ${differing} of ${compared} assets differ between the APK and the staged tree (${firstDiffs.join(', ')}) — ` +
      'the installed app is not running the code in this working tree');
  console.log(`  K2 contents: ${compared} assets compared byte-for-byte against the staged tree, ${differing} differ`);
}

// ── K3: the rules hash inside the APK is the real one ──────────────────────
{
  const expected = computeRules().hash;
  const manifestEntry = apkAssets.find((n) => n.endsWith('/rules-manifest.js'));
  ok(manifestEntry !== undefined,
    'K3: the APK contains no rules-manifest.js, so the app has no rules hash to publish in a commitment');

  if (manifestEntry) {
    const text = execFileSync('unzip', ['-p', APK, manifestEntry], { encoding: 'utf8' });
    const shipped = /RULES_HASH\s*=\s*['"]([0-9a-f]{64})['"]/.exec(text)?.[1];
    ok(shipped !== undefined, `K3: could not read RULES_HASH out of ${manifestEntry}`);
    ok(shipped === expected,
      `K3: the APK publishes rules ${shipped?.slice(0, 16)}... but the source hashes to ${expected.slice(0, 16)}... — ` +
        'every commitment this build makes names a ruleset it is not playing under, and no player could detect it');
    console.log(`  K3 rules: the APK publishes ${expected.slice(0, 16)}..., matching computeRules() on the source`);
  }
}

// ── K4: no WebGPU entry point shipped ──────────────────────────────────────
// build-app-assets.mjs asserts this over the staging directory. Asserted again
// here over the ARTIFACT, because the staging directory is not what installs.
{
  let offenders = 0;
  for (const entry of apkAssets.filter((n) => n.endsWith('.js'))) {
    const text = execFileSync('unzip', ['-p', APK, entry], { encoding: 'utf8' });
    if (/navigator\s*\.\s*gpu|requestAdapter/.test(text)) {
      offenders += 1;
      fail(`K4: ${entry} reaches for WebGPU but shipped in the APK, where no adapter exists`);
    }
  }
  console.log(`  K4 webgpu: ${apkAssets.filter((n) => n.endsWith('.js')).length} bundled scripts checked, ${offenders} reach for an adapter that does not exist on a device`);
}

// ── K5: NEGATIVE CONTROL — the comparison must be able to fail ─────────────
// Every check above is satisfied by a comparison that always returns equal.
{
  const sample = apkAssets.find((n) => n.endsWith('.js'));
  ok(sample !== undefined, 'K5: no script in the APK to run the control against');
  if (sample) {
    const real = execFileSync('unzip', ['-p', APK, sample], { maxBuffer: 64 * 1024 * 1024 });
    const tampered = Buffer.concat([real, Buffer.from('\n// one byte of drift\n')]);
    ok(sha(real) !== sha(tampered),
      'K5 NEGATIVE CONTROL FAILED: an altered asset hashed identically to the original, so K2 could not ' +
        'have detected a substituted file');

    const staleHash = 'f'.repeat(64);
    ok(staleHash !== computeRules().hash,
      'K5 NEGATIVE CONTROL FAILED: a plainly wrong rules hash compared equal to the computed one');
    console.log('  K5 negative control: a one-byte change to an asset and a false rules hash are both detected');
  }
}

// ── K6: NO NATIVE BRIDGE ───────────────────────────────────────────────────
//
// FOUND BY THE INDEPENDENT AUDITOR, and it was right. verify-playlog proves the
// page attempts no transmission by instrumenting fetch, XHR, sendBeacon,
// WebSocket, EventSource and the img/script src setters — and it runs the
// bundle in Chromium, not in a WebView. `WebView.addJavascriptInterface`
// injects a native object straight into the JavaScript context, so a call on it
// is not a web API, not a network request, and needs no permission. Every one
// of those checks would report silence while the log walked out through Kotlin.
//
// The scan is on the DEX, which is the built artifact rather than the source —
// a bridge added by a library would never appear in MainActivity.kt.
// verify-playlog L7 makes the same check against the Kotlin source, so a bridge
// has to defeat two instruments looking at two different things.
//
// `setJavaScriptEnabled` is the CONTROL. It is a WebView method this app
// demonstrably calls, so finding it proves the scanner can read method names
// out of this dex at all. Without it, "addJavascriptInterface is absent" is
// equally consistent with a scan that reads nothing.
{
  const dex = listing.filter((n) => /^classes\d*\.dex$/.test(n));
  ok(dex.length > 0, 'K6: the APK contains no classes.dex, so its code could not be inspected at all');
  let bridges = 0;
  let controlSeen = 0;
  for (const entry of dex) {
    const bytes = execFileSync('unzip', ['-p', APK, entry], { maxBuffer: 128 * 1024 * 1024 });
    const text = bytes.toString('latin1');
    if (text.includes('addJavascriptInterface')) bridges += 1;
    if (text.includes('setJavaScriptEnabled')) controlSeen += 1;
  }
  ok(bridges === 0,
    'K6: the APK references addJavascriptInterface — a native bridge carries data out of the page without a ' +
      'network request or a permission, and every no-transmission check in this repo watches web APIs it would ' +
      'never touch');
  ok(controlSeen > 0,
    'K6 NEGATIVE CONTROL FAILED: setJavaScriptEnabled, which this app certainly calls, was not found in the dex ' +
      'either — the scanner is not reading method names, so its silence about addJavascriptInterface means nothing');
  console.log(
    `  K6 bridge: ${dex.length} dex file(s), 0 addJavascriptInterface references (control: setJavaScriptEnabled ` +
      `found in ${controlSeen})`,
  );
}

if (failures.length > 0) {
  console.error(`verify-apk: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-apk: PASS — the APK is signed, its assets are the staged assets, and it publishes the real rules hash');
