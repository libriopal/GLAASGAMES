# Closed testing: the fourteen days

`PLAY-SUBMISSION.md` §1 states the requirement. This file is the plan for
satisfying it, and it is written around one fact that reorders everything else
on the project:

> **The compliance gate and the missing playtest are the same activity.**
> Google requires 12 testers for 14 continuous days. The games-user-research
> literature puts the sample sizes at 6 players to *discover* problems, 12 to
> *understand* them, 100 for reliable data. The number Google demands is exactly
> the number the research says is needed to understand players — and these 12
> will be the first humans ever to play this game.

Everything else in `next-steps-2.md` improves a game that cannot ship for at
least a fortnight regardless. So this starts first, and the fourteen days run in
the background while the rest of the work continues.

---

## What this build produces for it

| Artifact | Command | Where it lands |
|---|---|---|
| Signed App Bundle (upload this) | `npm run build:aab` | `android/app/build/outputs/bundle/release/` |
| Signed APK (sideload to your own phone) | `npm run build:apk` | `android/app/build/outputs/apk/release/` |
| Store icon, feature graphic, screenshot | `npm run build:store-assets` | `docs/store/` |
| Privacy policy, ready to publish as-is | — | `docs/privacy-policy.md` |

Upload the **`.aab`**. Play has required App Bundles for new apps since August
2021; the APK is for putting it on your own device before anyone else sees it.

---

## What only you can do

Stated plainly, because inventing progress through a console I cannot reach
would be worse than admitting the boundary. **Every step below needs a human
signed in to the Play Console. None of it can be done from this repository.**

1. **Finish account setup** — the $25 registration, identity verification and
   two-step verification must all be complete before anything can be uploaded.
2. **Create the app** in the console and fill the store listing: title, short
   description (80 chars), full description (4000), the privacy policy URL, and
   the screenshots. Drafts for the descriptions are in `PLAY-SUBMISSION.md` §7.
3. **Complete the Data Safety form.** The answers are in `PLAY-SUBMISSION.md`
   §5 and every one of them is "no data collected", which is true because the
   app has no `INTERNET` permission — the platform enforces it, so you are not
   promising anything you have to remember to keep.
4. **Complete the IARC content-rating questionnaire** (§6).
5. **Enrol in Play App Signing on the first upload.** This is the step that
   turns "lost the keystore, lost the listing forever" into a support ticket.
   Do not skip it. Back up `$HOME/glaas-release.jks` off this container first —
   the container is ephemeral and will be reclaimed.
6. **Create a closed testing track**, upload the `.aab`, and add the testers by
   email address or Google Group.
7. **Recruit 12 testers who will actually open the app.** Since 2026 Google
   applies engagement checks: twelve accounts that install and never play can be
   rejected, and the fourteen days start again.
8. **Wait 14 continuous days** with at least 12 testers opted in. If a tester
   opts out and the count drops below 12, the clock resets. Over-recruit.
9. **Apply for production access** once the fourteen days are complete.

---

## The note to send testers

Copy this as-is. It asks for the two things no oracle in this repository can
measure, and deliberately does not explain the mechanic — whether the game
teaches itself is one of the things being tested.

---

**Thanks for testing GLAAS · Lattice.**

It is a small dice puzzle. One round takes about two minutes. There is nothing
to buy, no ads, no account, and it works with the network off — the app has no
internet permission at all, so nothing you do in it leaves your phone.

**Please play at least one round a day for the next two weeks.** That is not a
politeness: Google checks that testers actually open the app, and a fortnight of
installs that were never played does not count.

What I would like you to notice, in your own words:

1. **Did you work out what the game wanted from you, without being told?**
   There is a How to Play panel on first launch. Did you read it? Did it help,
   or did you figure it out by playing?
2. **Did you ever feel you had guessed right — that you *knew* where the energy
   was going to go before you tapped?** That specific feeling is the whole
   question. If it never happened, say so; that is the most useful answer you
   can give me.
3. **Anything that felt slow, confusing, or ugly.** Especially the first thirty
   seconds.
4. **Anything that broke.** What phone, and what were you doing.

If the board ever fails to appear, the app will tell you so on screen — send me
that message. It is offline, so it is almost always the phone's WebView being
out of date; updating **Android System WebView** and **Chrome** in the Play
Store usually fixes it.

**On the "Show the answer" panel.** After a round you can reveal the hidden
layout. The app also re-checks its own round in front of you and shows a lock
and a fingerprint. You do not have to care about any of it — but the point is
that the layout was fixed *before* your first move and the app can prove it
didn't change while you played. If that panel is meaningless or off-putting,
that is worth telling me too.

**Your play log.** The app records what you did each round — which cell you took
and what the board looked like — on your phone, and nowhere else. It cannot send
it: there is no network permission. If you want to share one, I will send you a
one-line instruction for copying it out. Entirely optional, and nothing happens
if you ignore it.

---

## What the fourteen days are supposed to produce

Not just elapsed time. The build is instrumented (`lattice/telemetry.ts`,
checked by `verify-playlog`) so that a session log carries each turn's board,
the cell the player took, the cells that lit up in response, and how long they
took to decide.

That log is what closes the gap this project cannot close on its own.
`verify-learnable` measures a regional model against machine policies and finds
inference worth **4.2%** against a design target of 5%. What it cannot measure
is whether a *person* finds the structure. Replaying the same learner against a
human's recorded choices answers a different and better question: not "is there
an edge" but "did they take it".

**Honest limit:** the log is exported by hand, one tester at a time, only if
they bother. Twelve testers might produce two usable logs. That is still two
more than exist today, and the alternative — a network path that collects them
automatically — is the one thing this app must never grow, because "no data
collected" stops being enforced the moment it does.
