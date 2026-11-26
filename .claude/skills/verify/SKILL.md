---
name: verify
description: Drive an isolated LearnHarness 0.7.0 (bundled server on 127.0.0.1 plus headless Chromium) to prove a plugin's behavior. Boots a throwaway profile with your plugin dist, clicks through the real UI, calls the plugin backend, seeds a knowledge graph, and replays scripted model turns with no credentials. Use whenever you change a plugin in this repo and must show it working in the app, or need a screenshot of LearnHarness.
---

# Verify a plugin in an isolated LearnHarness

The harness lives in `tools/verify/`. Every command below runs from the repo root. It never touches the user's profile at `~/Library/Application Support/LearnHarness` or their vault. Each boot gets its own temp root, port, data dir, `HOME`, and auth file.

Requirements: `/Applications/LearnHarness.app` (0.7.0), Node 22 or later, `npm install` at the repo root once (installs `playwright-core`), and a cached `chromium_headless_shell-*` under `~/Library/Caches/ms-playwright/`. Set `LH_VERIFY_CHROMIUM` to point at another headless shell.

## Launch

Build your plugin first so `plugins/<name>/dist/manifest.json` exists. Then:

```sh
node tools/verify/boot.mjs --plugins plugins/<name>[,<other plugin dir>] [--port N] [--script tools/verify/fixtures/fake-turn.json] [--vault <dir to copy>]
```

- `--plugins` takes plugin roots (containing `dist/`) or dist dirs (containing `manifest.json`), comma-separated.
- Ready means this exact line on stdout: `ready http://127.0.0.1:<port> plugins=<id>:active,... state=<root>/state.json`. Boot waits until `GET /api/plugins` reports every plugin `active` and exits 1 if one reports `error`, printing the server log tail.
- `--script` starts the fake model and connects it as the keyless custom provider for the strong, cheap and vision slots. Without it the app has no model, and the composer shows `Add a provider key`.
- `--vault` copies the given directory to `<root>/vault`. Point your plugin's vault setting there. Never point a plugin at the real vault.
- The state file records `url`, `port`, `dataDir`, `pids`, `serverLog`, `vault`, and `fakeModel`. Pass it to every other tool.

## Doctor

Run this first whenever anything looks off:

```sh
node tools/verify/doctor.mjs <state.json>
```

It checks that the root exists, that the recorded server pid owns the port, that each plugin is `active`, and that the fake model answers. Exit 0 means the instance is worth driving. On failure read `<root>/server.log`, where plugin backend `console.log` lines also land.

## Drive

Write a short ES module that imports `tools/verify/drive.mjs`. Targets are Playwright selector strings. Prefer `role=` and `text=`.

```js
import { open, click, fill, waitFor, screenshot, callPlugin, readState } from "<repo>/tools/verify/drive.mjs";
const state = readState(process.argv[2]);
const s = await open(state.url);                       // s.page, s.errors, s.close()
await click(s.page, "text=Open hello view");           // a plugin sidebar action
await waitFor(s.page, "text=Hello from an external plugin");
await screenshot(s.page, "<evidence dir>/view.png");
console.log(await callPlugin(state.url, "<plugin id>", "<operation>", { any: "input" }));
await s.close();
```

Stable handles in the app:

- Composer: `role=textbox[name='What do you want to learn?']` on home, then `role=button[name='Start session']`. It is a contenteditable; `fill` types into it with real keystrokes.
- Graph: the home canvas is the native knowledge map. `role=button[name='Chains']` opens the chain table, whose header reads `<n> chains · <m> nodes`.
- Sidebar: plugin sidebar actions appear by their label (`text=<label>`); sessions appear by title.
- Home: navigate with `s.page.goto(state.url, { waitUntil: "domcontentloaded" })`.

Never use `waitUntil: "networkidle"`. The app keeps an SSE stream open, so network idle never comes. Wait for a locator instead.

Backend calls go to `POST /api/plugins/<id>/call` with `{"operation","input"}`. `callPlugin` returns `result` and throws with the server's `error` otherwise. Browser-only mode needs no secret, so curl works too.

Seed a graph (5 propositions, 3 chains, provenance into one seeded chat) into a running instance; no restart is needed:

```sh
node tools/verify/seed-graph.mjs <state.json> [--fixture <graph.json>]
```

It prints the minted `chatId`, `messageIds`, `nodeIds`, and `chainIds`. Your plugin's `ctx.learning.graph()` and `getSession(chatId)` read the same records.

Scripted model turns: a script is `{ "model", "turns": [{ "match"?, "content"?, "toolCalls"?: [{ "name", "arguments" }] }] }`. Each model request takes the first unserved turn whose `match` regex (if any) matches the request's JSON-encoded messages. Every request is logged to `state.fakeModel.log` (JSONL with the offered tool names and last message). Read that log to see which agent asked for what. `fixtures/fake-tool-turn.json` calls `list_sessions` and then replies.

The full worked example is `node tools/verify/examples/smoke.mjs --out <dir> [--plugins <extra dirs>]`. It boots, calls a backend op, seeds and screenshots the graph, runs a scripted turn with a tool call, and tears down.

## Evidence

- Save screenshots to `~/.claude/orchestrate/learnharness-gen-media/media/<plugin>/`, outside the temp root, so teardown cannot delete them. Open each screenshot and look at it before claiming anything.
- Capture the action and the resulting state: a screenshot before and after, plus the `callPlugin` result or the files the plugin wrote under `<dataDir>/plugins/<id>/data` or `<root>/vault`.
- Exercise the real user path, such as clicking the plugin's sidebar action. A backend call alone does not prove the UI.
- Report `s.errors`. `503` console errors on home were observed in every run, with and without a model. Their source is unidentified; treat other errors as findings.

## Cleanup

```sh
node tools/verify/teardown.mjs <state.json>
```

It signals only the recorded pids, and only while their stdout still points into this root. It kills each pid's process group, then deletes the root. Evidence saved outside the root survives. Never `pkill LearnHarness`, because the user's own app runs under that name. Run teardown after every failed attempt too.

## Isolation facts

- Instances run side by side on different ports, and the user's running app is unaffected.
- The server gets a minimal env: `HOME=<root>/home`, `LH_IGNORE_ENV_KEYS=1`, and no inherited provider keys. Settings start with `general.autoUpdate=false`.
- The Electron window path (CDP) is not wrapped here. Its API refuses direct curl with 403. Use this headless path unless you need Electron-only behavior.

## Feature map

`features/README.md` indexes the user-facing journeys and how to prove each.
