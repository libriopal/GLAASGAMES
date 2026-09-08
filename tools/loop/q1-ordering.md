# Artifact under review: a proposed development loop ordering

A team proposes that all work on a software project must pass through this
sequence, in this exact order, and repeat as a loop:

    RESEARCH  ->  AUDIT  ->  VERIFY  ->  DESIGN  ->  CODE  ->  (back to RESEARCH)

Definitions the team gives:
- RESEARCH: gather external evidence (papers, standards, platform guidelines,
  measurements from the existing system) about the problem to be solved.
- AUDIT: an independent party, who did not do the research, attacks the research
  output looking for unsupported claims, stale figures and reasoning errors.
- VERIFY: a human approver reads the audited research and either approves the
  resulting plan or sends it back. Machine checks that can be run at this point
  are also run.
- DESIGN: specify the artifact to be built, in prose, against the approved plan.
- CODE: implement, with executable tests.

Context: the project is a deterministic 4D game engine. Its simulation math is
integer-only fixed point (Q16.16) so that results are bit-identical across GPU
vendors. It already has a suite of deterministic checks that produce a stable
hash digest per run, and a CI job that executes the GPU shader on a software
Vulkan device and compares it bit-for-bit against a CPU reference. The team is
one person plus AI agents; there is no second human engineer.

Evidence the team collected, quoted as they gathered it:

1. Boehm (1981), 63 projects: defect fix cost rises roughly an order of
   magnitude per phase; requirements ~1x, design ~5-10x, code ~10-20x,
   post-release 50-200x. Boehm & Basili (2001) revised this down; small agile
   projects show roughly 5:1 overall rather than 100:1.

2. Menzies et al., "Are Delayed Issues Harder to Resolve? Revisiting Cost-to-Fix
   of Defects throughout the Lifecycle" (arXiv 1609.04886), 171 projects
   2006-2014: "We found no evidence for the delayed issue effect; i.e. the
   effort to resolve issues in a later phase was not consistently or
   substantially greater than when issues were resolved soon after their
   introduction." All 171 projects used the Team Software Process, which the
   authors disclose as a limitation.

3. Hevner (2007), "A Three Cycle View of Design Science Research": the Rigor
   Cycle grounds the work in the existing knowledge base before the Design Cycle
   builds and evaluates the artifact; the Relevance Cycle supplies requirements
   and acceptance criteria from the problem environment.

4. Kollanus & Koskinen (2009), survey of 153 software inspection papers: "the
   surveyed research provides clear evidence that inspections generally benefit
   software development and quality assurance."

5. Winkler, Biffl & Faderl (2010), controlled experiment: found "no significant
   advantages" for usage-based reading inspection versus inspection-based
   testing on defect detection performance, with contradictory results across
   two sessions.

6. Huang et al. and subsequent surveys on LLM self-correction: models largely
   cannot correct their own reasoning without external information, and naive
   self-critique can degrade performance. Reliability comes from external
   signals — deterministic re-execution, tool-grounded checks, or an independent
   critic model — rather than from a model judging itself.

7. Boyd's OODA loop: Orient is described as the phase that determines decision
   quality and the phase teams most often rush.

## What to audit

Attack the proposed ordering specifically.

(a) Is AUDIT before VERIFY the right way round, or is it backwards? Give your
    reasoning about what each step can and cannot establish.
(b) Is it coherent to place VERIFY before DESIGN and CODE exist? What exactly
    is being verified at that point, and what cannot be?
(c) Does evidence item 2 falsify the rationale for this ordering? If the delayed
    issue effect does not hold, what remains of the argument for front-loading?
(d) Which of the seven evidence items actually support this specific ordering,
    and which are being stretched beyond what they show?
(e) What failure mode does this ordering have that the team has not named?
    Be concrete about what goes wrong and when.
