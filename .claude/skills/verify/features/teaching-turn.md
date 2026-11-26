# Teaching turn

A user starts a teaching session from the home composer. The prober agent answers, possibly after calling tools.

## Sub-features

- `turn-start` creates a session from the composer and shows the user message.
- `turn-reply` streams the assistant reply into the transcript.
- `turn-tool` shows a tool call row (for example `LIST_SESSIONS`) before the reply.

## How to get to it (user POV)

- Type in the home composer and choose `Start session`.

## Driving it with drive.mjs

Preconditions:

- Booted with `--script tools/verify/fixtures/fake-tool-turn.json`. The composer model picker shows `fake-model`.

- **Start.** Run `fill(page, "role=textbox[name='What do you want to learn?']", "Teach me flow matching")` then `click(page, "role=button[name='Start session']")`. The header shows the session title and `PROBING`.
- **Tool and reply.** Run `waitFor(page, "text=Scripted reply after a tool call", { timeout: 30000 })`. A `LIST_SESSIONS` row sits above the reply.
- **Second view.** `state.fakeModel.log` holds two requests. The second carries the tool result. Each lists the 11 prober tools offered.

## Gotchas

- Every model role shares the fake model. A background agent can take a scripted turn meant for the prober; use `match` to pin turns.
- A plugin's tools reach prober and teacher only if registered. Check the offered tool names in the log.
- An exhausted script replies `[fake-model: script exhausted]`.
