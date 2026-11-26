# Evidence file format, version 1

An Evidence file proves that an Entry passed or failed one stage outside LearnHarness. The Build skill writes them from repos, and Run Desk writes them for GPU runs. Harness reads them and moves the Stage ledger. See `docs/adr/0001-evidence-files-are-the-only-shared-channel.md`.

## Where files go

```
<evidence root>/<entry id>/<stage>/<producedAt as YYYYMMDDTHHMMSSZ>.json
```

- The evidence root of a repo is `evidence/` at the repo root. Run Desk uses `<Run Desk data>/evidence/`.
- `stage` is `implement`, `optimize` or `serve`. Understand has no Evidence file. Harness proves it from teaching sessions.
- Files are append-only. A new attempt is a new file. The ledger uses the newest file per Entry and stage, by `producedAt`.

## Entry ids

Harness assigns the id and writes it into the Handoff. Writers copy it and never invent one.

- `paper.<arxiv id>`, for example `paper.2006.11239`
- `framework.<name>`, with sub-entries as `framework.<name>.<part>`, for example `framework.sglang.radix-cache`
- `own.<project>.<slug>`, for example `own.auteur.provider-asset-gates`

## Fields

Every file has these fields.

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"lh-evidence/1"` | Format version |
| `entry` | string | Entry id |
| `stage` | `"implement"`, `"optimize"` or `"serve"` | The stage this file proves |
| `outcome` | `"pass"` or `"fail"` | The result |
| `producedAt` | ISO 8601 UTC string | When the result was produced |
| `source` | `{ repo, commit }` | Repo path or URL and the exact commit |
| `command` | string | The exact command that produced the result |
| `gap` | `{ concept, why }`, optional | Only on a failure that traces back to something not understood |

Stage fields:

- `implement` adds `reference` (what the implementation is checked against) and `tests` as `{ passed, total }`.
- `optimize` adds `metric`, `unit`, `better` (`"lower"` or `"higher"`), `baseline`, `result`, `hardware` and `why` (one sentence on what made the difference).
- `serve` adds `endpoint`, `hardware`, `p50Ms`, `p95Ms`, `throughput` as `{ value, unit }` and `costPer1k` as `{ usd }`.

## Consistency rules

`validate.mjs` enforces these. Harness refuses a file that breaks one and shows why.

- `implement` passes only when `tests.total > 0` and `tests.passed === tests.total`.
- `optimize` passes only when `result` beats `baseline` in the `better` direction.
- `serve` passes only with positive latencies, `p50Ms <= p95Ms`, positive throughput and a non-negative cost.
- `gap` is allowed only when `outcome` is `"fail"`.

Examples are in `examples/`.
