# How the build plan was chosen

Arena run on 2026-11-26. Two research files fed it first: `research/2026-11-26-build-plan-seams.md` (codebase seams, file:line) and `research/2026-11-26-ui-and-mcp.md` (T3 Code copy plan, MCP SDK client, alphaXiv auth).

Three candidates wrote plans from the same brief, independently:
1. Opus, dependable: smallest verifiable steps, lowest merge cost. Score 23/30.
2. Sonnet, daily use first. Score 18/30.
3. Opus, bold: top capabilities before UI polish, challenge premises. Score 24/30.

A Sonnet judge scored them and checked their claims against source. Two premises decided it:
- `gen-media/tools/verify/boot.mjs:12-14` boots the released `/Applications/LearnHarness.app`, not the fork. Candidate 2 missed this, so none of its checks would have tested fork code.
- `plugins/harness/src/domain.ts` (about 157-175) closes a Gap on any newer pass for the stage, whatever its command, and on a newer Mark Understood. The vision says only a pass on the same command closes it. Candidates 1 and 2 copied the domain unchanged and then asserted the vision's rule, so their checks would fail on their own code. Only candidate 3 changes the rule.

**Base: candidate 3.** Grafted in:
- From 1: the `upstream-touch.mjs` guard, checks run by `sync-upstream.sh`, boot refusing a data dir under the real profile, the 2-of-5 → 0.4 headline fixture, plugin tests passing unchanged against the moved code, and the Rebuild track before the gate enforces (so the baseline has Implement attempts), with enforcement only at the baseline threshold.
- From 2: the weekly merge canary, the Today usage log, the vault regenerate-and-diff check, and per-feature parity before each plugin retires.
- From the judge: the Phase 3 Build-skill run needs a real model, so it is listed under open decision 2.

Deviations from the product brief's Order, argued by candidate 3: the prototype moves after the logic so it shows real ranker output, and pages stay plain until Phase 6.
