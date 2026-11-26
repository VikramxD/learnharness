---
status: superseded by ADR-0004
---

# Fork changes are additive only

The gen-media work lives on the `gen-media` branch of the VikramxD/learnharness fork. The fork's `main` only fast-forwards to `upstream/main`, and `gen-media` merges `main` after every sync (`gen-media/scripts/sync-upstream.sh`). On `gen-media` we only add files: plugins under `plugins/<id>/`, everything else under `gen-media/`, and the project verify skill under `.claude/skills/`. We never edit a file upstream owns, so upstream merges stay conflict-free. A change the host itself needs goes on its own topic branch off `main` and is offered upstream as a pull request. Unreleased upstream APIs, such as `feature/session-kinds`, are tried on `exp/` branches and never become dependencies of `gen-media` until they reach `upstream/main`.

## Considered Options

- Editing host files directly on the fork: rejected, every upstream release would turn into a merge-conflict session.
- A scheduled GitHub Action for syncing: rejected for now, because forks start with Actions disabled and enabling them would also run upstream's release and website workflows. `gh repo sync` fast-forwards the fork without Actions.
