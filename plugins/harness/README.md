# Harness

Harness is the core LearnHarness plugin for paper-to-production. It owns the Stage ledger, the Material Desk, the vault mirror and Handoff writing. See `GLOSSARY.md` and `docs/adr/` at the repo root.

## Data

Harness keeps its records in the plugin's `data/` folder:

- `ledger.jsonl` is the append-only event log. One reducer in `src/domain.ts` folds it into the ledger state, and stage status is derived from that state.
- `settings.json` holds the vault path, the evidence roots and the feed keywords.
- `papers/<arxiv id>/paper.pdf` and `frameworks/<name>@<shortsha>/` hold downloaded PDFs and read-only checkouts.
- `vault-manifest.json` records every vault note Harness wrote, with its hash.

Evidence files follow `contracts/evidence/README.md`. Harness validates them with `contracts/evidence/validate.mjs`, which the build bundles.

## Build

Copy the `types/` folder of the LearnHarness authoring skill into `.sdk/`, then run:

```sh
npm install
npm run typecheck
npm test
npm run verify:seed   # checks seed/roadmap.json against arXiv and GitHub
npm run build
npm run install:local -- "<plugins-directory>"
```

`install:local` replaces only the installed `dist/` and keeps `data/`. Restart LearnHarness to load changed code.

The vault mirror runs only when you press Sync vault. It writes only under `<vault>/LearnHarness/` and never overwrites a note you edited.
