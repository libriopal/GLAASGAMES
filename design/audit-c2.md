# Independent audit — the belief-display search (C2)

Auditor: `CF_AUDIT_MODEL` on Cloudflare Workers AI. Different vendor, different
weights, no access to this repository. Two dispatches; both exhausted their token
budget inside deliberation, and the second drafted its final answer verbatim in
the trace before the cut. That draft is quoted below. **The verdict line was cut
off, so this cycle has NO recorded APPROVE.** It is being treated as REVISE,
because three of the four findings are actionable and one is a real defect.

## What it said

> (a) The fitness function optimizes for mathematical signal properties rather
> than cognitive utility, meaning it prioritizes a display that reacts
> predictably to data over one that actually aids mental modeling; a concrete
> failure would be a high-contrast, highly responsive strobe that changes
> violently with every minor belief shift, scoring perfectly on all metrics while
> being cognitively useless.
>
> (b) Normalizing each property against the best in the field makes the score
> relative to a potentially mediocre population, masking the fact that the entire
> candidate set might be functionally useless, whereas properties should instead
> be measured against absolute, human-centric performance benchmarks.
>
> (c) The decoy only tests for directional reversal, failing to account for
> structural errors like misidentified links or incorrect node connections, which
> matters because players are far more likely to hallucinate a connection than to
> simply reverse a direction.
>
> (d) Showing a wrong belief with the same visual confidence as a right one
> creates false certainty, which destroys player trust in the UI and leads to
> catastrophic frustration when the player's mental model is punished by the
> game.

## Disposition

**(c) — ACCEPTED, and it is the one that matters.** It is correct and it is
specific. A reversed decoy is the easiest wrong belief to tell apart, because it
is 180 degrees away in exactly the channel the winner encodes. A belief that is
merely rotated by one quarter turn — the "I think this region flows north when it
flows east" error, which is the common one — was never tested at all. Fixed: the
trial now carries a FAMILY of decoys (reversed, quarter-turned each way,
scrambled), and discrimination is the WORST case across them rather than the
easy one. See `foundry/visual/evolve.ts`.

**(b) — PARTLY ACCEPTED.** The relative scale is defended in the source: there is
no absolute unit for "how different two pictures are", and inventing one would be
a constant nobody measured. But the auditor's real point survives that defence —
a relative scale cannot say whether the whole field is useless. Fixed by adding
an ABSOLUTE FLOOR alongside the relative score: discrimination in raw units must
clear a threshold derived from the legibility minimum (a difference smaller than
the smallest mark a player can see is not a difference), and `verify-belief` B13
asserts the declared winner clears it. The ranking stays relative; the
publishable claim no longer rests only on the ranking.

**(a) — ACCEPTED AS A LIMIT, NOT FIXED.** It is right that nothing here measures
reading time, error rate or interpretability, because measuring those needs
players and this project has none. The specific failure it names — a violently
strobing display — is the one case the fitness does already catch, since
`stability` is scored and a strobe fails it. What remains uncaught is the wider
class: a display that is discriminable, stable, responsive, legible and still
hard to READ. That is recorded as an open limit rather than papered over, and it
is the reason `DECLARED_BEST` is pinned by a test rather than by a claim to be
good.

**(d) — ACCEPTED AS DESIGNED BEHAVIOUR, WITH A MITIGATION.** The widget shows the
player's own reconstruction, and the client genuinely does not have the answer,
so it CANNOT hedge by comparing against truth. Drawing a wrong belief as
confidently as a right one is therefore not a bug: it is the only honest thing a
client without the answer can do, and the alternative — dimming beliefs the
client "suspects" are wrong — would require the client to hold the secret, which
is the leak this whole module is built to avoid. The mitigation is that
confidence is drawn from EVIDENCE VOLUME, not from correctness, and the aria
label says so in words ("8 observations, agreement 86%") rather than implying a
verdict.
