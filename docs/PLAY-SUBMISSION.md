# Getting this on Google Play

What the build already satisfies, what you still have to do, and the one thing
that will cost you two weeks if nobody tells you about it now.

---

## 1. The requirement nobody expects

**A new personal developer account cannot publish to production until it has run
a closed test with at least 12 testers who stay opted in for 14 continuous
days.** Introduced 13 November 2023, reduced from 20 testers to 12 on
11 December 2024, and in 2026 Google added engagement checks — so twelve
accounts that install and never open the app can now be rejected.

This is not a technical problem and no amount of engineering removes it. Plan for
it first, because it is the long pole:

- **Personal account** — 12 testers, 14 days, per app. This is the common indie path.
- **Organization account** — exempt from the tester requirement, but needs a
  D-U-N-S number and organization verification, which has its own timeline.
- **Personal account created before 13 November 2023** — grandfathered, exempt.

Registration is a one-time $25 fee. Identity verification and two-step
verification must both be complete before you can upload anything.

## 2. Target API level

**From 31 August 2026, new apps and updates must target Android 16 (API 36).**

Already done: `targetSdk = 36`, `compileSdk = 36`. Verified in the built artifact
rather than only in the build file — `aapt2 dump badging` on the release APK
reports `targetSdkVersion:'36'`.

`minSdk = 24` covers effectively the whole install base still receiving Play
distribution, and guarantees WebGL2 in the System WebView.

## 3. The 16 KB page size rule

Apps targeting Android 15+ must support 16 KB memory pages. This applies to
**native code**, and the requirement is satisfied here in the strongest possible
way: **the APK contains no `.so` files at all.** Verified — `unzip -l` finds
zero. There is no native library to misalign.

`android/gradle.properties` carries a note about this so that whoever adds the
first native dependency has to read it.

## 4. Minimum Functionality — the policy that rejects web wrappers

Play rejects apps that are thin wrappers around a website. This is the single
most likely rejection reason for anything built on a WebView, so it is worth
being precise about why this build is not one:

- **Every asset ships inside the APK.** 122 KB of game, staged by
  `scripts/build-app-assets.mjs` into `android/app/src/main/assets`.
- **There is no `INTERNET` permission.** Not "we don't use the network" — the
  app *cannot* use it. The platform enforces that, not a promise in a form.
- **It works in aeroplane mode**, on first launch, forever. The daily world is
  derived from the date by integer arithmetic, so there is nothing to download.
- **There is no website to wrap.** No hosted URL, no Digital Asset Links, no TWA.

A Trusted Web Activity was the obvious alternative and was rejected for exactly
this reason: a TWA points at a live site, needs hosting, and is offline-hostile.

## 5. Data Safety and the privacy policy

The Data Safety declaration is the simplest one the console offers:

| Question | Answer |
|---|---|
| Does your app collect or share any required user data? | **No** |
| Is all data encrypted in transit? | N/A — no data leaves the device |
| Do you provide a way to request deletion? | N/A — nothing is stored off-device |
| Advertising ID | **Not used** |

A privacy policy URL is still **required** even when nothing is collected. A
short static page is enough; `docs/privacy-policy.md` in this repository is
written to be published as-is (GitHub Pages will serve it free).

## 6. Content rating

Answer the IARC questionnaire honestly and this rates in the lowest bracket:
no violence, no sexual content, no profanity, no gambling, no user-to-user
communication, no user-generated content, no purchases, no ads, no data sharing.

**Note the gambling answer specifically.** This repository's governance suite
machine-bans loot boxes, artificial scarcity timers, streak punishment and
loss-framing (`game/economy/rules.ts`), and `verify-daily.ts` fails the build if
the daily module grows any of them. The rating answer is enforced by a test, not
remembered by a person.

## 7. Store listing assets you still need

The build produces the binary; these are the human parts.

- App icon, 512×512 PNG (the in-app adaptive icon is a vector; the store needs a
  raster one)
- Feature graphic, 1024×500
- At least 2 phone screenshots — 4 to 8 reads better. `app-shot.png` in the
  scratchpad shows what a capture looks like.
- Short description (80 chars) and full description (4000)
- A privacy policy URL (see §5)

## 8. Build commands

```bash
npm run verify              # everything, including the new replay/daily/controls oracles
npm run build:web           # compile the hosts
npm run build:app-assets    # stage the bundle into android/app/src/main/assets
npm run build:apk           # signed release APK  -> android/app/build/outputs/apk/release/
npm run build:aab           # signed release AAB  -> android/app/build/outputs/bundle/release/
```

**Upload the `.aab`**, not the `.apk`. Play has required the App Bundle format
for new apps since August 2021. The APK is for sideloading onto your own device.

## 9. Signing — read this before you lose two years of work

The release key lives at `$HOME/glaas-release.jks`, and its password is in
`$HOME/.env`. **Neither is in this repository and neither should ever be.**

Play requires every update to be signed with the same key as the original
upload. Lose that keystore or its password and you cannot update the app under
that listing — ever. There is no recovery and no appeal.

Two things to do now, before the first upload:

1. Back the keystore up somewhere that is not this container. The container is
   ephemeral and will be reclaimed.
2. Enrol in **Play App Signing** when you first upload. Google then holds the
   app signing key and your upload key becomes replaceable if it is lost. This
   converts an unrecoverable mistake into a support ticket.

The build refuses to fall back to the debug key when the release keystore is
absent — it leaves the artifact unsigned instead. An APK signed with a debug key
looks releasable and is not, and that is a worse failure than a loud one.

## 10. What has and has not been tested

Stated plainly, because the difference matters.

**Executed and passing:**
- The full engine suite, including the three new oracles.
- The shipped web bundle driven in headless Chromium at a 412×915 phone
  viewport: it loads, draws (6.3% of pixels lit, peak 255 — a particle field,
  not a black screen and not a full-screen blob), the floating stick moves the
  player, ana/kata travel through w, and finishing a run verifies its own replay
  and prints the digest.
- Control geometry across ten real device viewports, headlessly.
- Release APK signature: `apksigner verify` reports v2 scheme, correct DN.
- APK contents: targetSdk 36, GLES 3.0 declared, zero permissions, zero native
  libraries, 19 asset files.

**Not tested, and why:**
- **The APK has never been run on a device or emulator.** This container has no
  `/dev/kvm`, so no Android emulator can boot here. The web bundle inside it has
  been driven in Chromium, which is the same engine the WebView uses, but the
  Kotlin activity — the asset loader, the immersive mode, the pause handling —
  has been compiled and never executed. Install it on your phone; that is the
  first real test.
- **Real-silicon GPU parity.** `web/parity.html` takes the measurement CI cannot:
  it runs the simulation shader on the device's actual GPU and compares it, tick
  by tick, against the reference. It has been proven working here against
  SwiftShader (600 ticks, bit-identical, digest `0x3926c2e8`), but SwiftShader is
  still software. Open that page in **Chrome** on your phone — not in the app,
  since a WebView has no WebGPU — and record what the adapter line says.
