# Build plan: proof before polish

Chosen by arena on 2026-11-26 from three candidates; see `plan-synthesis.md`. It implements `vision.md`.

Terms follow `gen-media/GLOSSARY.md`. Paths are repo-relative on `gen-media`. **[core]** marks an upstream-core edit (offered upstream as a PR), **[hot]** marks an upstream hotspot. Every done check runs in the verify harness against an isolated instance with the keyless fake model, never the real profile or vault.

The vision's top three capabilities and the headline baseline land before any styling. Until Phase 6, fork pages are plain but work.

## Phase 0: Point the verify harness at the fork (S)

**Goal.** Every later done check runs against fork code. Today `tools/verify/boot.mjs:12` boots the released `/Applications/LearnHarness.app`, so it cannot prove fork app code.

**Delivers.** No capability. Every later phase depends on it.

**Touches.** `gen-media/tools/verify/boot.mjs` (add `--source <repo>`, which builds and starts the fork's Next server with the same isolation env), and `seed-graph.mjs`, which gains three seeders: practice chats with `conclude` toolCalls at chosen past timestamps, chain provenance, and a fixture `ledger.jsonl`. Back-dated fixtures replace a clock override, so the server keeps using `Date.now`.

Also new: `gen-media/scripts/upstream-touch.mjs`, which fails when a file outside fork-owned folders differs from `upstream/main` and is not on its allowlist, and `sync-upstream.sh` runs every phase's checks after each merge. A weekly canary merges `upstream/main` into a scratch branch and runs the suite.

**Done check.** `npm run test:verify` boots the fork from source, `doctor.mjs` passes, and canary `GET /api/product/health` returns the booted commit. Against the released app it must 404. Boot must refuse an `LH_DATA_DIR` under `~/Library/Application Support/LearnHarness`. `upstream-touch.mjs` must fail on a scratch edit to `components/chat.tsx`.

**Unblocks.** Everything.

## Phase 1: Harness becomes app code, and the baseline clock starts (M)

**Goal.** Move the ledger, Material Desk, vault mirror and Handoff writing from `plugins/harness` into `src/product/harness/`, and retire the plugin's write path in the same phase so the ledger never has two writers (ADR 0002). Start recording the headline metric's baseline on the day this ships.

**Delivers.** The base for 1, 2, 3 and 12, and the headline metric.

**Touches.**
- New: `src/product/harness/*` copied from the plugin, `app/api/product/*` routes, and a plain `app/ledger/page.tsx`.
- `instrumentation.ts` gets one init call. `notify` reuses `emit("plugin-message", …)`, so `src/core/events.ts` is not edited.
- A one-time import of the existing `ledger.jsonl` from a path set in fork settings (`src/product/settings.ts`, its own file, since `settings.json` strips unknown sections).
- New projection `headline.ts` with a pure `firstImplementGapRate(events, gateShippedAt?)`: for each Entry, its first Implement Evidence file, whether it carries a Gap, and the cohort of its `MarkedUnderstood` (`pre-gate`, or `cold-checked` later). A `GatePolicy {mode: "shadow", at}` event marks the start of the baseline period.
- In shadow mode, every Mark Understood also records `ColdCheckStatus` (Phase 4's rule, computed, not enforced).
- In parallel: open the two upstream PRs for capability 10 (`src/core/plugin-submissions.ts:175`, `src/core/question-core.ts:476`) **[core]**. Their wait time is unknown, so start it now.

**Done check.** `plugins/harness/tests/*` pass unchanged against `src/product/harness`. A fixture where 2 of 5 first Implement attempts carry a Gap returns 0.4. A second import leaves the ledger unchanged. Boot with the fixture ledger. `GET /api/product/ledger` matches the plugin's projection of the same file exactly, and a JSON diff fails on any difference. Mark an Entry understood through `/ledger`. The event shows up with `cohort: pre-gate` and a shadow `ColdCheckStatus`. The Harness plugin is disabled in the product build, so the instance has one ledger writer.

**Unblocks.** 2, 3, 4.

## Phase 2: Gap loop with one-click sessions (S–M)

**Goal.** Capability 1, and the vision's Gap rule as actually written. **The current domain contradicts it.** In `plugins/harness/src/domain.ts:161-173`, a newer `MarkedUnderstood` closes a reopened Understand, and `newestEvidence` lets any newer pass on that stage close it, whatever the command. The vision says a Gap closes only when the same command passes.

**Delivers.** 1, the first part of 12 (open Gaps only), and the product brief's one-click Material session.

**Touches.**
- `domain.ts`: a `Gap` is keyed by `(entry, stage, command)`. Only a newer `outcome: pass` with the same `command` closes it. Re-marking understood does not close it.
- New `src/product/today/rank.ts`: a pure ranker.
- Plain `app/today/page.tsx`.
- Client start through `SessionStarter.start({title: goal})` (`components/start-session.ts`, 1 commit). The goal names the failing Evidence file, its command and `source.commit`, which the teacher reads with its read-only file tools. A server-side `linkSession` call links the new chat.
- `app/page.tsx` points `/` at Today. This is a one-line change to a cool file.
- Today appends each shown and started action to a local usage log, so later phases can see what actually got used.
- No **[hot]** edits.

**Done check (Playwright).**
1. Drop a failing Implement Evidence file with a `gap` into a registered folder. Within one sync, `/today` shows the Gap action first and `/ledger` shows Understand reopened.
2. Click the action. A chat is created whose first turn contains the command, and the ledger links it.
3. Drop a passing file with a different command. The Gap stays open.
4. Drop a pass with the same command. The Gap closes.

**Unblocks.** 3, because Rebuild failures route through this loop.

## Phase 3: Rebuild track (S)

**Goal.** Capability 3. Framework sub-entries, plus Handoffs that name the Framework at its pinned commit as the reference.

**Touches.**
- Sub-entry seeds (`framework.diffusers.ddim-scheduler`, `framework.trl.dpo-loss`) and a Handoff template in `vault.ts`.
- Evidence contract v2 (`gen-media/contracts/evidence/`): `reference` may be `{framework, repo, commit}`. The validator refuses an Implement pass on a `framework.*` Entry unless `reference.commit` equals the Material Desk's pinned checkout commit.
- `skills/build-from-handoff` reads the new reference.

**Done check.**
- `validate.test.mjs` refuses a Rebuild whose reference is the learner's own earlier output.
- A real end-to-end run on CPU/MPS, which needs a real model for the Build skill (open decision 2): the DDIM scheduler is rebuilt through the Build skill and compared with diffusers at a pinned commit on 3 fixed seeds (`atol` 1e-5). It produces an accepted Implement Evidence file, and `/ledger` shows the stage moving. One deliberately wrong timestep spacing must produce a failing file with a Gap, which Phase 2's loop then shows on Today.

**Unblocks.** The first real learning output, and the first-Implement attempts the baseline cohort needs before the gate enforces.

## Phase 4: Cold check gate (S)

**Goal.** Capability 2. Prove the reader in shadow mode, then switch the gate to enforced once the baseline threshold (open decision 1) is met, and schedule due cold checks on Today. Shadow mode schedules nothing, so it cannot contaminate the baseline.

**Touches.**
- New `src/product/harness/cold-check.ts`: a reader over `learning.getSession` for `conclude` toolCalls (`src/agent/tools/practice.ts:136-165`), with teach time taken from the chain provenance message timestamp. The vision's gate is the rule in `markUnderstood`.
- `GatePolicy {mode: "enforced"}`, written once, which sets `gateShippedAt` for the headline split.
- `rank.ts` adds due cold checks, ranked after Gaps. Starting a cold check opens a practice chat (`kind: "practice"`) linked to the Entry.

**Done check.**
- Unit level: the vision's fixture triple. A same-day pass is refused and the reason is shown. An R3 pass is refused. An R1 pass eight days later is accepted. A `missClass: "structural"` pass and a synthesized `dismissed` pass are both refused.
- Shadow counts on three seeded chats equal a committed hand count before enforcement.
- Playwright on back-dated seeded chats: the Mark Understood button shows the refusal text, and `/today` lists the due cold check after the open Gap.

**Unblocks.** The headline comparison, and 7.

## Phase 5: Role profile, claims, role-aware sessions (M)

**Goal.** Capabilities 4 and 5, which complete 12.

**Touches.**
- New `src/product/roles/` with the types `RoleProfile` and `CapabilityClaim {quote, url, fetchedAt, stage, entryIds}`, plus refresh and stale marking.
- Seed profiles from the research file: generative-media RE, plus an inference engineer profile as the schema test.
- `rank.ts` adds uncovered claims.
- Role context: `registerInstructions` is one fixed text for every chat (`src/server/plugin-host.ts:251-257`), so the claim quote and URL go in the one-click opening goal. A per-chat `role_context` tool waits until that proves too weak.

**Done check.**
- The validator refuses a claim without a URL or `fetchedAt`.
- A projection test checks that a claim's stage equals the minimum across its Entries.
- The inference profile loads with no schema change.
- A refresh against a fixture HTTP server that redirects a posting URL marks its claims stale.
- Playwright: a one-click session on a claimed Entry sends a first turn that contains the claim quote. The A/B `plan_init` check from the vision needs a real model (open decision 2).

**Unblocks.** 6 and 8, which key off claims.

## Phase 6: Own shell and the T3-style interface (M–L)

**Goal.** The brief's Order steps 1–2: a two-day throwaway prototype fed real ranker output, then the real shell.

**Touches.**
- `app/layout.tsx` picks the shell per pathname. It is touched once and is not a hotspot.
- New `components/product/ui/`, with primitives copied from T3 Code with import fixes and the MIT notice. Their tokens are scoped under `.product-shell` so upstream screens are not restyled.
- Own name, icon and accent color.
- The session screen is restyled by scoped CSS only; `components/chat.tsx` **[hot]** is untouched.

**Done check.**
- Playwright screenshots of `/today`, `/ledger` and `/chat/<id>` in light and dark mode.
- Tests fail on `T3Wordmark`/`T3AppIcon`/"T3 Code" outside the notice, or on any change to an upstream route's `--background`.

**Unblocks.** Daily use.

## Phase 7: MCP client, alphaXiv, Lab radar (M)

**Goal.** The brief's general MCP client, plus capability 6.

**Touches.**
- A core-plugin MCP client: one line in `core-plugins.json`. It wraps the allowlisted four read tools as `AgentTool`s and caches `listTools` at connect.
- The alphaXiv key goes in a fork credential file (mode 0600). `src/core/auth-keys.ts` is not touched.
- Radar UI calls the feeds and the researcher tools from the server.

**Done check.**
- Against a fixture MCP server, agents get exactly the four tools, and none labelled Writes or Destructive.
- A fake 429 response turns into a readable `isError` result.
- A lab with no researchers renders as "unresolved".

## Phase 8: Calibration, interview room, portfolio (L)

**Goal.** Capabilities 7, 8 and 9. Run Desk, Focus and the vault become built-in; each plugin retires only after its parity suite passes against the moved code on the same fixtures.

**Done checks.** These are the vision's own checks:
- Calibration counts on three seeded chats match a hand count.
- The room renders no hint or side-question control, a submission after the clock expires records `timed out`, and every deep-dive question cites a file or Gap.
- Portfolio: a test checks out each line's commit, reruns its command and compares the outcome.
- Vault mirror: delete it, regenerate it, and the diff is empty.
- Run Desk tests use a fake launcher; no paid compute.

## Open decisions

1. **How long the baseline runs before Phase 4 enforces.** Longer gives more pre-gate first-Implement attempts; shorter gets the gate sooner. Suggested: at least 10 attempts or four weeks, whichever comes first.
2. **Real-model checks.** Phase 3's Build-skill run, capability 5's A/B check and any prober-quality check need a paid model. Approve a budget, or accept fake-model checks only.
3. **Product name, logo and accent color.** These block Phase 6 only.
4. **Migration source.** Where the live `ledger.jsonl` sits is UNCONFIRMED. The learner points the settings at it once.

## Risks

- **Upstream drift.** Fork edits to upstream files are only `app/page.tsx`, `app/layout.tsx`, `instrumentation.ts` and `core-plugins.json`, none a hotspot. A weekly merge runs `npm run test:verify`.
- **Thin baseline cohort.** `headline.ts` reports cohort sizes, and the comparison is labelled observational.
- **Gap rule change rewrites history.** Fixing the closure semantics could reopen Gaps in the imported ledger. Phase 2 prints a diff of the reopened Gaps against the plugin's projection before it switches.
- **Base UI and Radix overlays nesting.** Fork surfaces use Base UI only.
- **Trade dress.** Own accent color, and the notice states the interface is unofficial.

## Deferred

- Paper defense (11), which is blocked on the unmerged `registerSessionKind`.
- Session rendering beyond scoped CSS, and the ledger-aware graph (`graph-view.tsx` is a hotspot).
- GPU Rebuilds until rented GPUs arrive.
- Packaging until the product is the daily app.
- Calibration on explanations until the capability 10 PRs merge. Until then the view says explanations are unmeasured.
