# Knowledge graph

The home canvas is the native knowledge map: propositions, chains, and the sessions they came from. The chain table lists them by session.

## Sub-features

- `graph-canvas` draws propositions, chain junctions, and session cluster labels.
- `graph-chains` opens the chain table with a `<n> chains · <m> nodes` header.
- `graph-provenance` links nodes back to the chat that produced them.

## How to get to it (user POV)

- Open home. The canvas fills the main pane.
- Choose `Chains` in the top bar.

## Driving it with drive.mjs

Preconditions:

- `node tools/verify/seed-graph.mjs <state.json>` ran. It seeds 5 propositions and 3 chains with provenance into the chat `Flow matching for video generation`.

- **Canvas.** Open home and `waitFor(page, "role=button[name='Chains']")`. The canvas shows nodes and the label `Flow matching for video generation`.
- **Chain table.** Run `click(page, "role=button[name='Chains']")` then `waitFor(page, "text=3 chains · 5 nodes")`.
- **Second view.** `GET <url>/api/graph` returns 5 propositions plus 1 derived implication node, 3 chains, and `sessions` naming the seeded chat.
- **Session.** The sidebar lists `Flow matching for video generation` with 4 messages.

## Gotchas

- The canvas animates as it settles. Wait for a locator before screenshotting.
- Seeding appends. Seed twice and you get two chats and two copies of every node.
