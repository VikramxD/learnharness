# LearnHarness plugin verification map

This directory is the maintained source for proving plugin behavior in an isolated LearnHarness. Read the index, then use the matching feature file as the recipe.

## Baseline preconditions

- Boot with `node gen-media/tools/verify/boot.mjs --plugins <dirs>` and keep the printed `state=` path.
- `node gen-media/tools/verify/doctor.mjs <state.json>` exits 0.
- Never drive an instance this run did not boot. The user's own LearnHarness runs under the same process name.

## Driving conventions

- Drive through `gen-media/tools/verify/drive.mjs` with `role=` and `text=` selectors.
- Wait for a locator, never for network idle.
- Start each recipe from home (`page.goto(state.url)`).

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Pair every UI claim with a second, read-only view: a `callPlugin` result, `GET /api/graph`, or a file under the root.
- Report an unreachable path with the command tried and the unmet precondition.

## Features

- [Plugin view](./plugin-view.md) covers sidebar actions, the plugin view, and host dialogs.
- [Plugin backend call](./plugin-backend.md) covers `POST /api/plugins/<id>/call` and plugin data dirs.
- [Knowledge graph](./knowledge-graph.md) covers the seeded graph on the home canvas and the chain table.
- [Teaching turn](./teaching-turn.md) covers starting a session and a scripted model reply with a tool call.
