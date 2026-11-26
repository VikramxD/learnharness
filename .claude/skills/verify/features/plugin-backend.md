# Plugin backend call

A plugin's backend registers operations with `ctx.handle`. Its frontend reaches them through the host, and the harness calls them over HTTP.

## Sub-features

- `call-ok` returns the handler's result under `result`.
- `call-unknown` returns `{"error":"Unknown plugin operation: <op>"}`.
- `data-dir` gives the backend a private dir at `<dataDir>/plugins/<id>/data`.

## How to get to it (user POV)

- The plugin's own UI triggers the call. The HTTP call is the second, read-only view of the same handler.

## Driving it with drive.mjs

Preconditions:

- Booted with `--plugins tools/verify/fixtures/echo-plugin` (id `verify-echo`) or your plugin.

- **Call.** Run `callPlugin(state.url, "verify-echo", "echo", { ping: 1 })`. The result is `{ echoed: { ping: 1 }, dataDirectory: "<dataDir>/plugins/verify-echo/data" }`.
- **Unknown op.** Run `callPlugin(state.url, "verify-echo", "nope")`. It throws with `Unknown plugin operation: nope`.
- **Logs.** Backend `console.log` output lands in `state.serverLog`.

## Gotchas

- Plugins cannot call each other. `ctx.call` reaches only the plugin's own backend.
- A write with a foreign `Origin` header is refused. `callPlugin` sends none.
