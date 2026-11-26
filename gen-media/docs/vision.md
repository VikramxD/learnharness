# Vision: the ledger is the interview

Every role this product prepares for publishes its requirements. Pika wants "RL-based post-training for video diffusion/flow-matching models" and "defenses against reward hacking". Anthropic wants "baselines, ablations, and enough statistical care". Those lines are claims. The bet is that a candidate who backs each claim with proof they produced, under conditions they cannot fake, is ready. Preparation becomes producing that proof.

LearnHarness already does the hardest part. The prober brackets a floor and a ceiling. The teacher moves one reasoning step at a time and checks each step. The product keeps all of it. It changes what goes in, what counts as done, and what comes out.

**What goes in.** A role profile turns postings into capability claims, each with its URL and fetch date. Each claim links to the Entries that would prove it, including Own work from Auteur and Fictora. alphaXiv's feeds and researcher tools show what people at the target labs published this quarter. The prober learns the role through a per-turn instruction, so a flow-matching session probes toward the claim the learner is studying it for.

**What counts as done.** Understand currently passes on a feeling checked on the spot. The research file says that feeling is least reliable for explanations with visible mechanisms, and those are what this teacher produces. So Understand passes only after a cold check. That is a practice pass on the Entry at least seven days after teaching, at hint rung R1 or lower. Implement, Optimize and Serve already need Evidence files. A Rebuild uses the Framework itself as its reference, so "I understand the diffusers scheduler" means my scheduler matches its outputs on fixed seeds. When a build fails because of a concept, the Gap opens a teaching session on that concept with the failing command attached. The Gap closes only when the same command passes.

**What you see.** Today opens on one ranked next action, not a menu. A pure function over the ledger picks it from open Gaps, cold checks that are due, and uncovered claims, in that order. A claim's stage is the lowest stage proven across the Entries that back it.

**What comes out.** The interview room is unassisted. It has a clock and no side questions or hint ladder. It runs the two formats the labs confirm, live Python coding without AI help and a deep-dive on your own work. Its questions come from your Evidence files and your Gaps, so it asks about what you built and where it broke. Every miss schedules a teaching session on its concept. The calibration view puts your confidence beside your cold-check results, per claim. The portfolio publishes accepted Evidence with the commit and command that reproduce it, the public track record four researched postings ask for.

Roles are data, so the product generalizes. An inference engineer profile built from the Baseten and Anthropic postings leans on Optimize and Serve claims such as roofline analysis, KV-cache management and p95 latency. An RL research engineer profile leans on Implement and Optimize claims about controlled experiments. Neither should need new code. If one does, the claim model is wrong.

One number says whether this works. The Gap rate on first Implement attempts should fall for Entries that passed the cold check, compared with Entries marked understood before the gate existed. That earlier cohort is the baseline period, and it is recorded before the gate ships. The comparison is observational, not a controlled trial. If the rate does not fall, the gate goes.

The product refuses some things. Drills do not sit at the center, because Lab Bench put them there and was dropped. Paper discussion and ML system design are not presented as known interview stages, because no primary page confirms them. The teaching loop is not edited. The two core changes this vision wants are confidence on free recall and answer pose time, and both go upstream as small PRs.

## Ranked capabilities

Ranked by learning value per unit of build effort. "Core" means the upstream core loop.

### 1. Gap loop

**What it is.** An Evidence file with `outcome: fail` and a `gap` reopens Understand, as the glossary already defines. The product then puts a one-click Material session on Today whose goal is the gap concept. The failing Evidence file, its command and the diff at its commit go in as learner files. After the session, the Build skill reruns the exact command.

**Relies on.** The Evidence `gap {concept, why}` field (`gen-media/contracts/evidence/README.md`), `EvidenceAccepted` in the Harness domain, and one-click Material sessions from the first usable version. Core untouched.

**How you'd know.** Write a failing Evidence file with a gap for a test Entry. Within one sync, Today shows the gap session and the ledger shows Understand reopened. The Gap stays open until a newer Evidence file for the same Entry and stage passes, and a pass on a different command does not close it. Either failure is visible in the ledger.

**Effort.** S. **Learning value.** Very high. It is the only signal anywhere that links a production failure to a concept, and today nothing acts on it.

### 2. Cold check gate on Understand

**What it is.** `markUnderstood` requires a linked practice session that started at least seven days after the last linked teach session and concluded a problem on that Entry with `outcome: solved`, `rung` null, R0 or R1, and no `structural` miss. Today schedules the cold check when the delay elapses.

**Relies on.** A Harness domain rule beside `markUnderstood` (`plugins/harness/src/domain.ts:208-211`) and a fork-owned reader over `data/chats/*.json` for `conclude` records (`src/agent/tools/practice.ts:136-165`). Practice already accepts outside problems and retests misses. Core untouched.

**How you'd know.** A fixture ledger refuses Understood with a same-day practice pass and shows the reason. It also refuses a pass at R3. It accepts a pass at R1 eight days later. The real test is the headline number. After eight weeks, Entries that passed the gate should have a lower first-attempt Implement Gap rate than the ones marked understood before it. If they do not, cut the gate.

**Effort.** S. **Learning value.** Very high. It turns "feels obviously true" into a claim the learner can check against delayed, low-help retrieval, which is the condition the transfer evidence supports (Pan & Rickard 2018, Kapur 2014).

### 3. Rebuild track for Frameworks

**What it is.** A Framework such as diffusers, TRL or vLLM splits into sub-entries like `framework.diffusers.ddim-scheduler`. A teach session reads the real source through the pinned checkout and `read_files_from_github_repository`. The Handoff then names the Framework at its pinned commit as the reference. The learner's Rebuild passes Implement when it matches the Framework's outputs on fixed seeds. Using the Framework again with what was learned goes through Optimize against a named Baseline.

**Relies on.** Entry sub-entries, Material Desk pinned checkouts, Handoffs, the Build skill and Evidence `reference`. The alphaXiv GitHub tool allows 150 calls an hour, so pinned checkouts carry most reads. CPU and MPS on the M5 cover schedulers, samplers and small losses. GPU work goes through Run Desk once rented GPUs arrive. Core untouched.

**How you'd know.** Each Rebuild has an Implement Evidence file whose `reference` names the Framework and commit, with `tests.passed === tests.total`. The validator already refuses any other pass. A Rebuild whose tests compare against the learner's own earlier output, not the Framework's, should fail review of the Handoff.

**Effort.** S, mostly Handoff templates and sub-entry seeds. **Learning value.** Very high. The product brief names use, Rebuild, use again as the way Frameworks are learned, and this makes each step provable.

### 4. Role profile with sourced capability claims

**What it is.** A new Harness domain type beside `Entry`. A role profile holds capability claims, each with a quoted line, a posting URL, a fetch date and the stage that would prove it. Claims link to Entries. Uncovered claims show on Today. A refresh refetches postings and marks claims from closed postings stale.

**Relies on.** Fork-owned storage and the interface. The research file already lists eleven target and eleven adjacent postings with quotes. Core untouched.

**How you'd know.** Every claim renders its URL and fetch date, and the validator refuses a claim without them. A claim with no linked Entry shows as uncovered. A refresh on a closed posting, such as a DeepMind URL that now redirects to search, flags its claims stale instead of keeping them silently. A claim's stage equals the minimum proven stage across its Entries, which a projection test checks. A second profile for an inference engineer, built from the Baseten and Anthropic Performance Engineer postings, must fit without a schema change. If it needs one, the model fails.

**Effort.** S to M. **Learning value.** High. It decides what to study from what the role demands, and every later capability keys off it.

### 5. Role-aware probing and planning

**What it is.** When a session is linked to an Entry that backs a claim, a per-turn instruction gives the prober and teacher the claim text and its source. The probe then aims at the parts of the material the role cares about, such as reward hacking in a DPO paper.

**Relies on.** `registerInstructions({agents, text})` on main (`docs/plugin-authoring.md:532`), with no edit to `prober/` fragments. Core untouched.

**How you'd know.** Run the same Entry twice, once with the role linked and once without. The role run's `plan_init` tree contains at least one node that addresses the claim, and the control does not. If both trees match, the instruction is not doing anything.

**Effort.** S. **Learning value.** Medium to high. It points the minimal tree at the role without touching the method.

### 6. Lab radar

**What it is.** For each target lab in a role profile, the Material Desk lists recent papers by that lab's researchers and the hot feed, each tagged with the claim it might prove or "no claim". One click adds a paper as an Entry and saves it to the alphaXiv lineage folder.

**Relies on.** alphaXiv `find_researchers` with `affiliation`, `get_researcher_papers`, `get_hot_feed` and `get_for_you_feed`, all labelled Read. The interface calls them, not agents, so the agent allowlist in the product brief stays at four tools. The feeds use no assistant quota, so the radar prefers them over `discover_papers`. Core untouched.

**How you'd know.** For Pika, Odyssey and World Labs, the radar returns papers from the last 180 days by researchers at that affiliation. If `find_researchers` returns nobody, the lab shows as unresolved instead of an empty list. A test lists every alphaXiv tool the product exposes and fails if any is labelled Writes or Destructive. Track the share of radar picks that reach Understand within four weeks. Below one in five means the radar is producing noise.

**Effort.** S. **Learning value.** Medium. It keeps the reading current with the labs, but it only matters once claims exist to tag against.

### 7. Calibration view

**What it is.** A per-claim and per-Entry view that puts quiz confidence at teaching time beside cold-check outcomes, hint rungs, miss classes, coding test results and Evidence Gaps. It shows where the learner felt sure and was wrong.

**Relies on.** A fork-owned reader over `data/chats/*.json` and the ledger. Later it can move to a record kind whose `extract` reads raw turns (`upstream/feature/session-kinds:docs/plugin-authoring.md:603-607`). The graph stays free of learner state, as upstream intends. Core untouched.

**How you'd know.** On three real chat files, the reader's counts of answers, confidence buckets and verdicts equal a hand count. Any mismatch fails. Over eight weeks, the gap between mean confidence and cold-check pass rate should shrink. If it does not, the view is not changing how the learner studies.

**Effort.** M. **Learning value.** High. Feelings of understanding are miscalibrated, most of all for explanations (Rozenblit & Keil 2002), and the method's terminal condition is a feeling.

### 8. Unassisted interview room

**What it is.** A fork-owned managed agent with a clock and no side questions, hints or research tools. It runs two formats. Live coding poses Python and PyTorch problems through the Coding Questions runner. The deep-dive interrogates the learner's own Evidence files, Gaps and Own work Entries, in STAR form where DeepMind asks for it. Every miss goes into the room's own record and puts a teaching session on its concept on Today. The room never writes the ledger, so ADR 0001 holds.

**Relies on.** `ctx.agents` with `kind: "input"` tools on main (`docs/plugin-authoring.md:607-612`) and the Coding Questions runner whose 30 s deadline suits CPU problems. It depends on nothing unreleased. Core untouched.

**How you'd know.** The room renders no side-question or hint control, and its agent has no research tool. A submission after the clock expires is recorded as timed out, not graded. Every deep-dive question cites the Evidence file or Gap it came from, and a question without one fails a test. A miss produces a teaching session on Today and no ledger event.

**Effort.** M to L. **Learning value.** High. Explaining your own work unassisted is the mechanistic-explanation demand that punctures the illusion of understanding (Fernbach 2013), and it matches what OpenAI, Black Forest Labs and DeepMind say they ask.

### 9. Proof portfolio

**What it is.** A page generated from accepted Evidence files, grouped by capability claim. Each line shows the stage, the metric against the Baseline, the commit and the exact command.

**Relies on.** The ledger's accepted Evidence and the Evidence `source` and `command` fields. Core untouched.

**How you'd know.** Pick any line, check out the commit and run the command. The outcome matches the file. A line whose command does not reproduce is a bug in the portfolio, not a footnote.

**Effort.** S. **Learning value.** Low to medium. Its main value is hiring, since World Labs, DeepMind, Hugging Face and Modal postings ask for a public track record.

### 10. Confidence on free recall, and pose time

**What it is.** Two small additive fields. `confidence` on `explain` answers and practice problems, and a pose timestamp beside `answeredAt`.

**Relies on.** `src/core/plugin-submissions.ts:175` and `src/core/question-core.ts:476`. This touches the core contract, so it goes upstream as two narrow PRs under ADR 0004.

**How you'd know.** After the PRs merge, a saved `explain` answer carries `confidence` and a pose time. The calibration view then covers explanations, not only multiple choice. Until they merge, the view shows that explanations are unmeasured.

**Effort.** S to build, with an unknown upstream wait. **Learning value.** Medium. It measures calibration where the research says the illusion is strongest.

### 11. Paper defense session

**What it is.** A session kind whose prober probes the paper's prerequisites and whose replaced teacher prompt cross-examines the learner on the paper's claims, ablations and failure modes, citing pages through one batched `answer_pdf_queries` call. It records into a fork record kind that reads thinking.

**Relies on.** `registerSessionKind` and `registerRecordKind`, which exist only on `upstream/feature/session-kinds`. The local `exp/session-kinds` branch already prototypes `harness:material`. Core untouched, but blocked on an unreleased upstream API.

**How you'd know.** Each challenge in the record cites a page. Two weeks later, a cold check on the same Entry shows whether the defense held. It is labelled practice for an unconfirmed format, never as a known interview stage.

**Effort.** M, after upstream ships. **Learning value.** Medium.

### 12. Today ranker

**What it is.** The single ranked next action on Today, as a pure function over ledger state, role claims and due cold checks.

**Relies on.** Items 1, 2 and 4. Fork-owned. Core untouched.

**How you'd know.** A fixture ledger yields the same order on every run, with open Gaps before due cold checks before uncovered claims. A Gap-free failure adds nothing to the queue.

**Effort.** S. **Learning value.** Medium alone, high once items 1, 2 and 4 exist, so it ships with them.

## Cut

- A single readiness percent. It hides which claim is weak.

- A generic coding problem bank. No target posting asks for one, and practice already accepts outside problems.
- Drills or flashcards as the center of prep. Lab Bench did that and was dropped. FSRS cues stay as a side aid.
- ML system design as a marketed interview stage. No primary page confirms it.
- Spoken mock interviews. No seam records speech quality.
- Hours-studied totals and streaks. Deliberate practice explains under 1% of variance in professions (Macnamara 2014).
- Agent writes to the alphaXiv library, and any use of `publish_paper`.
- Job applications and résumé writing.
- Learner state in the graph, and any edit to the teaching prompts.

New terms this vision uses that are not yet in `GLOSSARY.md` are role profile, capability claim and cold check.
