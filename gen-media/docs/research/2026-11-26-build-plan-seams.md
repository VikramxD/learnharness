# Build-plan seams: codebase facts for the product fork

Researched 2026-11-26 on `gen-media`. Paths are repo-relative; UNCONFIRMED marks unverified claims.

## 1. App shell

- Root layout wraps every route in providers and `AppShell` (`app/layout.tsx:36-48`). `AppShell` renders `SessionsSidebar` beside the content, then `KeyboardShortcuts`, `PluginWidgets` and `StartupMessage` (`components/sidebar.tsx:1189-1206`).
- `/` is `app/page.tsx:12-23`, which renders `components/home.tsx` (graph or chains view). The sidebar logo links to `/` (`components/sidebar.tsx:849`). The `jump-graph` shortcut pushes `/` (`components/keyboard-shortcuts.tsx:133-134`). Pointing `/` at Today moves both.
- The sidebar has a fixed Teaching and Practice door block inside `PluginSidebarActions` (`components/sidebar.tsx:870-893`). Plugins can place extra buttons there (`components/plugin-chrome.tsx:76-84`). The sidebar has no nav-item registry.
- Mounting: new routes such as `app/today/page.tsx` and `app/ledger/page.tsx` are additive. They render inside the upstream sidebar because there is one root layout. Making Today the home needs one of three changes: a one-line change in `app/page.tsx` (6 upstream commits), a `redirects()` entry in `next.config.ts` (21 commits), or a shell swap in `app/layout.tsx` (16 commits). A fork-owned shell beside upstream's screens needs `app/layout.tsx` to pick a shell per pathname. Avoid `components/sidebar.tsx`, which has 82 commits and is a top-5 hotspot.
- Upstream files to change, fewest first: `app/page.tsx` (home), and `app/layout.tsx` (only if the shell is replaced).

## 2. Built-in features and storage

- Storage is JSON and JSONL files with no SQLite and no migrations framework. `LH_DATA_DIR` relocates all mutable data (`config.ts:20-35`). Under `data/` there are `chats/`, `graph/`, `jobs/`, `settings.json` (`config.ts:118`) and `prompts/`. Plugin data lives at `data/plugins/<id>/data` for community plugins and `data/core-plugin-data/<id>` for core plugins (`src/server/plugins.ts:26-31`, `src/store/plugin-data-paths.ts:9-29`). The settings migration chain is empty (`src/store/settings.ts:7-10`). Ports are defined in `src/core/ports.ts:1-10` and wired once in `src/server/stores.ts:1-27`.
- `settings.json` whitelists its sections (`src/core/settings.ts:899-925`), so a fork section would be stripped. Fork settings need their own file. The Harness already does this (`plugins/harness/src/settings.ts:22-68`).
- The Harness ledger is portable as-is:
  - `LedgerStore` is an fs-only append-only JSONL store with torn-tail repair (`plugins/harness/src/store.ts:7-52`).
  - The reducer and its decisions are pure (`plugins/harness/src/domain.ts:80-228`).
  - `createHarness` depends only on `{directory, dataDirectory, learning, notify}` (`plugins/harness/src/service.ts:19-31`).
  - In app code, `learning` is `createPluginLearningData({...stores})` (`src/server/plugin-learning.ts:17-45`), already built in `src/server/plugins.ts:43-51`. `notify` can be `emit("plugin-message", {pluginId:"harness", topic})` (`src/core/events.ts:42`) or a new event type, which would edit core `events.ts`. Cleanest hosting: `src/product/harness/` with domain, store and service, `app/api/product/...` routes, and an init call from `instrumentation.ts` (2 upstream commits). Migrating means copying the existing `ledger.jsonl` (live location UNCONFIRMED; the repo `data/` has no `plugins/` folder).
- How tools reach agents:
  - `registerTools` and `registerInstructions` live in `src/server/plugin-host.ts:251-266`. Contributions are collected per turn by `agentContributions` (`src/server/plugin-host.ts:403-480`) and exposed by `getPluginAgentContributions` (`src/server/plugins.ts:113-115`).
  - `chat-handler` fetches them (`src/server/chat-handler.ts:430-436`). `buildAgent` appends instructions to the system prompt and tools to the built-ins (`src/agent/teacher-agent.ts:228-251`).
  - Targets are only `prober`, `teacher` and `practice` (`src/core/plugins.ts:116`).
  - Two ways to add MCP tools without touching `src/agent`. (a) Wrap `getPluginAgentContributions` in `src/server/plugins.ts` (6 commits) to merge a fork registry. (b) Ship the MCP client as a core plugin by adding its id to `core-plugins.json` (1 commit), built from `plugins/<id>` by `scripts/build-core-plugins.mjs:64`.
  - `@modelcontextprotocol/sdk` 1.32.1 is already a dependency. (used only by `src/agent/claude-code/tool-bridge.ts`).

## 3. Cold check data

- Practice outcomes are recorded. The `conclude` tool schema is at `src/agent/tools/practice.ts:136-165`:
  - `outcome`: `solved | solvedWithHints | movedOn | surrendered | dismissed`
  - `verdict`: string
  - `rung`: `"R0".."R5" | null`
  - `missClass`: `cue | discrimination | execution | careless | structural | null`. A "structural miss" is `missClass === "structural"`; there is no separate boolean.
  - `retest`: boolean
- Storage: each call is persisted in `data/chats/<id>.json` → `messages[]` as an assistant message with `content[]` holding `{type:"toolCall", id, name:"conclude", arguments:{...}}` (pi-ai `ToolCall`). The message has `timestamp` in epoch milliseconds (pi-ai `AssistantMessage`). A dismissal synthesizes `arguments:{outcome:"dismissed"}` with no rung or missClass (`src/core/native-messages.ts:414-456`).
- Session-level fields: `ChatRecord.kind` (`"practice"`, absent means teach) and `createdAt`/`updatedAt` (`src/core/contracts/chat.ts:24-39`).
- The pose is the preceding `problem` toolCall with `statement`, `mode`, `modelSolution` and optional `target[]` proposition ids (`src/core/practice-problems.ts:4-25`). `problemInputForConclude` joins them (`src/core/native-messages.ts:490-530`). Plugin coding problems use the same `conclude` (`plugins/coding-questions/src/contract.ts:17`).
- No server-side reader of `conclude` records exists; only `components/practice-cards.tsx` reads `missClass`. The fork must write one over `learning.getSession`.
- Teach timestamps:
  - `MarkedUnderstood.at` holds `chatIds` and `chainIds` (`plugins/harness/src/domain.ts:52,95-96`).
  - `SessionLinked.at` is the link time, not the teach time.
  - Precise teach time: each `GraphChain.provenance[]` entry is `{chatId, messageId}` (`src/core/contracts/graph.ts:37-74`), and that message's `timestamp` is the teach time.
  - Problem→Entry attribution can come from either the practice session's `SessionLinked`, or from `problem.target` ids matching nodes of the Entry's understood chains (the second is UNCONFIRMED as robust; untagged problems have no target).
- Verdict: the gate (practice `createdAt` ≥ teach time + 7 days, `outcome === "solved"`, `rung ∈ {null, R0, R1}`, `missClass !== "structural"`) is computable with no core edits.

## 4. Session start with material on main

- `POST /api/chats {title, kind?: "practice", graphContext?}` returns `{id, title}` (`app/api/chats/route.ts:26-53`). The client then calls `stashOpeningPrompt(id, text)` (sessionStorage, `components/opening-prompt.ts:16-26`) and navigates to `/chat/<id>`, which sends the text as turn 1 (`components/start-session.ts:18-36`). Fork client code can call `SessionStarter.start({title: goalText})` with the Harness `teachingGoal` text (`plugins/harness/src/goal.ts:26-48`) and then `linkSession` server-side using the returned id. No core edit is needed.
- `registerSessionKind` and `registerRecordKind` are not on main or `upstream/main`. `upstream/feature/session-kinds` is not merged.
- The `exp/session-kinds` prototype (commit 3b1989c7) relied on four things. Of these, only `registerSessionKind` is missing on main; the interceptor and `turn-settled` both exist (`src/core/plugins.ts:299`, `src/core/events.ts:16`).
  - `ctx.registerSessionKind` (`harness:material`: native prober/teacher segments plus one text block, `record:"graph"`).
  - `registerSubmissionInterceptor` prepending `Harness entry: <id>` and the goal to the first message.
  - `ctx.events.on("turn-settled")` auto-linking by that marker line.
  - The draft URL `/chat/new?kind=harness:material`.
- `registerInstructions({agents, text})`:
  - The text is a static string captured at registration (`src/server/plugin-host.ts:251-257`) and applied to every chat of the targeted kinds. It is not per session.
  - It reaches only conversation agents built through `chat-handler` (prober, teacher, practice). It does not reach side questions, extraction or subagents; the only caller is `src/server/chat-handler.ts:430`.
  - Role-aware teaching per session therefore needs either the role text in the opening goal, or a `registerTools` factory, which does receive `{chatId, agent}` per turn (`src/core/plugins.ts:122-125`), for example a `role_context` tool. Vision §5's "per-turn instruction" overstates the API.

## 5. Credentials and settings

- Secrets live in `auth.json`, a flat `{VAR: value}` map stored with mode 0600 at `AUTH_FILE`, set by `LH_AUTH_FILE` (`config.ts:157`, `src/store/auth.ts:1-48`).
- Writable ids are the curated `AUTH_KEYS` catalog plus provider env vars (`src/core/auth-keys.ts:32-75`, `src/server/keys.ts:68-70`). The routes are `PUT/DELETE /api/keys/:id` (`app/api/keys/[id]/route.ts`).
- An alphaXiv Bearer key needs either a new `AUTH_KEYS` entry in `src/core/auth-keys.ts` (15 commits), or fork-owned storage. Unknown vars in `auth.json` are preserved but are not editable through the API (`src/store/auth.ts:13-15`).
- The settings UI is a dialog, and `/settings` redirects (`app/settings/page.tsx`). Sections come from the hardcoded `SECTIONS` array (`components/settings/settings-dialog.tsx:66-73`; the file has 35 commits). Plugin pages use the `plugin:<id>` section type (`components/settings/settings-dialog.tsx:74`, `components/settings/plugin-settings-page.tsx`). A built-in fork section means editing that array.

## 6. Interview room pieces

- Managed agents: `createPluginAgentService` (`src/agent/plugin-agents.ts:75`) takes definitions `{id, instructions, model, tools?, maxTurns?}` (`src/core/plugin-agents.ts:30-36`). Tools may be `kind:"input"`: declarative, with no `execute`, and they pause the run (`src/agent/plugin-agents.ts:282-293`). The service is constructed per plugin in `src/server/plugins.ts:56-61` with `createPluginInference`. Fork app code could construct one directly with its own record store.
- A no-tools agent is just a definition without `tools`. There is no built-in clock or timeout on managed sessions (UNCONFIRMED beyond `maxTurns`).
- The Coding Questions runner exports `runTests({dataDirectory, questionId, answer, tests, signal})` (`plugins/coding-questions/src/runner.ts:170`), with a 30 s timeout and a 64 KiB output cap (`plugins/coding-questions/src/runner.ts:6-7`). It is a core plugin (`core-plugins.json`).

## 7. Upstream drift

- `git log --oneline gen-media..upstream/main | wc -l` returns **0**. `gen-media` is 39 commits ahead. The merge base is `e3cfff6e` (2026-11-26). Upstream has 1321 commits since 2026-08-21, about 13.6 a day.
- Hotspots (90-day commits): `components/chat.tsx` 175, `components/graph-view.tsx` 125, `src/server/chat-handler.ts` 78, `components/sidebar.tsx` 76, `src/agent/subagents/extraction.ts` 70, `src/core/index.ts` 59, `src/core/settings.ts` 49, `config.ts` 47, `components/home.tsx` 46.
- Cool seam files (all-time commits): `core-plugins.json` 1, `components/start-session.ts` 1, `instrumentation.ts` 2, `components/plugin-chrome.tsx` 4, `app/page.tsx` 6, `src/server/plugins.ts` 6, `src/server/plugin-host.ts` 7, `app/api/chats/route.ts` 8.
- Import fork modules directly; do not grow the `src/*/index.ts` barrels.

## Seams the plan needs

| Seam | Files touched | Upstream core? | Effort |
|---|---|---|---|
| Today as home | `app/page.tsx` (or `next.config.ts` redirect) + new `app/today/` | n (shell file, 1 line) | S |
| Fork shell beside upstream | `app/layout.tsx` (pathname shell switch) + new `components/product/` | n (shell) | M |
| Ledger as app code | new `src/product/harness/*`, `app/api/product/*`; `instrumentation.ts` init | n | M |
| Ledger change events | reuse `plugin-message` emit, or add type in `src/core/events.ts` | y if new type | S |
| One-click Material session | new client using `SessionStarter` + server `linkSession` | n | S |
| Role context per session | opening goal text, or per-chat `registerTools` tool | n | S |
| Agent tools from fork / MCP | `src/server/plugins.ts` wrap of `getPluginAgentContributions`, or `core-plugins.json` entry | n | S-M |
| Cold-check reader | new reader over `data/chats/*.json` `conclude` toolCalls + chain provenance | n | S |
| Cold-check gate | Harness `markUnderstood` rule (`domain.ts:208`) | n | S |
| alphaXiv key | `src/core/auth-keys.ts` entry, or fork credential file | n (core file, additive) | S |
| Product settings UI | `components/settings/settings-dialog.tsx` `SECTIONS` + own settings file | n (UI hotspot) | S |
| Interview room agent | new service via `createPluginAgentService` + `runTests` | n | M-L |
| Confidence on explain, pose time | `src/core/plugin-submissions.ts`, `src/core/question-core.ts` | y (upstream PR) | S |
| Paper defense session kind | needs `registerSessionKind` (unmerged) | y (blocked) | M |
