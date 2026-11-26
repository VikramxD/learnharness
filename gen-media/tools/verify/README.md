# tools/verify

Prove fork code or a plugin's behavior in a real, isolated LearnHarness without touching the user's profile or vault. Boot runs one of two targets: the fork built from source (`--source <repo>`), or the released `/Applications/LearnHarness.app` (the default). Agents should read `.claude/skills/verify/SKILL.md`, which has the full recipe and the feature map.

## Quick start

```sh
npm install                                    # once, installs playwright-core
node tools/verify/boot.mjs --source .. [--plugins plugins/<name>]   # fork from source
node tools/verify/boot.mjs --plugins plugins/<name>                 # released app
# ready http://127.0.0.1:<port> target=source:<commit> plugins=<id>:active state=<root>/state.json
node tools/verify/doctor.mjs <state.json>
node tools/verify/seed-graph.mjs <state.json>  # optional
node tools/verify/teardown.mjs <state.json>
npm run test:verify                            # harness and upstream-touch unit tests
npm run verify:checks                          # every checks/*.mjs, in order
npm run check:upstream-touch                   # fails on edits to upstream files the fork does not own
```

## Targets

`boot` resolves one `target`, `{kind:"source", repo}` or `{kind:"released", app}`, into the binary, args, cwd and env it spawns (`resolveTarget`).

- **Source** runs `<repo>/.next/standalone/server.js` with host Node. Before booting, it runs `npm run build` and `node scripts/build-server.mjs` in the repo and writes `.next/standalone/product-build.json` as `{commit, dirty, builtAt}`. It skips the build when the stamp names `HEAD` and the tree is clean. Pass `--rebuild` to force a build. A build takes minutes.
- **Released** runs the app's bundled server through its Electron binary with `ELECTRON_RUN_AS_NODE=1`. `LH_VERIFY_APP` overrides the app path.

`--plugins` is optional in both modes. `GET /api/product/health` exists only in the fork and returns `{product: "gen-media", commit, dirty, builtAt}` from the stamp. The released app returns 404 for it. `checks/00-fork-health.mjs` asserts both responses.

`node tools/verify/examples/smoke.mjs --out <dir> --plugins <hello-plugin dir>` runs the whole loop once.

## Files

| File | Purpose |
| --- | --- |
| `boot.mjs` | Builds the source target if needed, creates `$TMPDIR/lh-verify-*`, copies each plugin dist, enables it, sets `general.autoUpdate=false`, and starts the target's server on 127.0.0.1. It waits until `GET /api/plugins` shows every plugin `active`, then writes `state.json`. |
| `doctor.mjs` | Read-only health check of a booted instance. |
| `drive.mjs` | Playwright helpers: `open`, `click`, `fill`, `waitFor`, `screenshot`, `callPlugin`, `readState`. They use the cached `chromium_headless_shell` and never wait for network idle. |
| `seed-graph.mjs` | Writes a chat record plus `graph/nodes.jsonl`, `chains.jsonl`, `sessions.jsonl`, and `format.json` with provenance into that chat. |
| `fake-model.mjs` | OpenAI-compatible loopback server that replays scripted turns, including tool calls. |
| `teardown.mjs` | Stops the recorded pids and deletes the temp root. |
| `isolation.mjs` | `assertIsolated(path)` throws when a path resolves inside `~/Library/Application Support/LearnHarness`. |
| `checks/` | Done checks that exit non-zero on failure. `run-checks.mjs` runs them. |
| `fixtures/` | `echo-plugin` (backend op `echo`), `graph.json`, and fake-model scripts. |

## Isolation guarantees

- Each boot owns a fresh temp root, port, data dir, auth file, and `HOME`. Parallel boots do not share anything.
- The server env contains only `PATH`, `TMPDIR`, `HOME`, and the `LH_*` and Next variables boot sets. `LH_IGNORE_ENV_KEYS=1` stops the custom provider from reading `CUSTOM_OPENAI_API_KEY`. No provider key from your shell reaches the instance.
- Teardown signals a pid only while that process's stdout still points into its root. The server renames its process title to `next-server`, so a command-line check would not work. Teardown removes only a directory named `lh-verify-*` directly under the temp dir.
- Boot calls `assertIsolated` on the temp base, data dir, auth file and vault copy before it writes anything, and `seed-graph.mjs` calls it on its data dir. The guard resolves symlinks through the nearest existing ancestor and compares against the real home captured before `HOME` is overridden.

## Fake model: no credential needed

The custom provider supports a **Keyless** mode (`docs/custom-providers.md` in the app bundle). In browser-only mode, `POST /api/custom-provider` accepts a same-origin request that carries `Origin` and `If-Match` from a prior GET (`src/server/custom-provider-http.ts`). Keyless never resolves a key (`src/server/custom-provider-auth.ts`). `boot.mjs --script <file>` starts the fake model and connects it at `http://127.0.0.1:<port>/v1` with `authMode: "keyless"`. Discovery lists one model from `GET /v1/models`. Boot then selects that model for the strong, cheap and vision slots via `PUT /api/settings/models`. The resulting `auth.json` holds only the keyless binding and no key.

Script shape:

```json
{ "model": "fake-model", "turns": [
  { "toolCalls": [{ "name": "list_sessions", "arguments": {} }] },
  { "match": "tool_call_id", "content": "reply after the tool" }
] }
```

Each `POST /v1/chat/completions` serves the first unserved turn whose `match` regex (if present) matches the request's JSON-encoded messages. Streaming and non-streaming responses are both supported. When the script runs out, the reply is `[fake-model: script exhausted]`. Every request is logged to `<root>/fake-model.jsonl`.

## Graph on-disk format (0.7.0)

Read from `src/store/graph.ts`, `src/store/graph-format.ts`, `src/store/chats.ts`, and `src/core/contracts/graph.ts`:

- `data/graph/nodes.jsonl` has one `{id, name, statement, aliases[], createdAt, provenance[{chatId, messageId}]}` per line. The first line for an id defines it.
- `data/graph/chains.jsonl` has one `{id, premises[≥1 node id], conclusion, provenance[], createdAt}` per line. Edges are derived and never stored.
- `data/graph/sessions.jsonl` holds `{chatId, foldedAt}` checkpoints. Seeding one stops the extractor from re-reading the chat.
- `data/graph/format.json` is `{"version": 1}`.
- `data/chats/<id>.json` is `{id, title, createdAt, updatedAt, messages[], version: 2}`. Every message has an `id`. User messages carry `content` as a string. Assistant messages carry `content: [{type:"text", text}]` plus `api`, `provider`, `model`, `usage`, `stopReason`, and `timestamp`.

The server reads these files on every request, so seeding a running instance needs no restart.

## Not covered

- The real Electron window (CDP). Its API refuses direct requests with 403, so this harness uses the headless server path.
- Background roles (extractor, auditor) share the fake model. A script meant for the prober can be consumed by them; pin turns with `match`.
