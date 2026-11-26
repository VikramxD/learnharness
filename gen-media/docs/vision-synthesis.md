# How the vision was chosen

`vision.md` came from an arena on 2026-11-26. Three writers got the same brief: two on Opus, one on Sonnet. The brief was grounded in the product brief, glossary, ADRs, `research/2026-11-26-role-prep-harness.md`, the teaching methodology and prompts, and upstream's session-kinds docs. One Opus writer was told to take the boldest defensible direction.

All three converged on the same core without seeing each other:
- Understand needs a delayed, unassisted cold check.
- A build failure with a Gap routes back to its concept.
- A role is data: capability claims quoted from postings, with URL and fetch date.
- Unconfirmed interview formats are never presented as known stages.

**Base.** Candidate 3, the bold Opus draft. A Sonnet cross-judge scored it highest on grounding, generalization, falsifiable checks and ambition (5/5 on each), and the coordinator agreed. It is the only draft with an outcome metric that can kill its own central rule.

**Grafts:**
- From candidate 2: Today as one ranked next action from a pure function, with a deterministic fixture check (item 12). Also the test that fails if any exposed alphaXiv tool is labelled Writes.
- From candidate 1: a claim's stage is the minimum proven stage across its Entries, a stale flag on postings that now redirect, and cutting a single readiness percent.
- From the judge: the Gap-rate headline compares against a baseline period recorded before the gate ships, and says it is observational.

**Rejected.** Candidate 2 asked the learner to predict the top item as a check, which is too soft. Candidate 1's alphaXiv researcher tools for agents were dropped, because candidate 3 calls them from the interface so the agent allowlist stays at four tools.

**Verified.** The judge flagged `registerInstructions` as not on main. That is wrong: `docs/plugin-authoring.md:532` documents it and `src/server/plugin-host.ts:251` implements it on the fork's main.
