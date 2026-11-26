# Run Desk

Run Desk launches GPU runs on Modal, reads their W&B results, and writes Evidence files the same way a repo does (see `docs/adr/0001-evidence-files-are-the-only-shared-channel.md`). Harness reads those files from `<Run Desk data>/evidence/` and moves the Stage ledger. Run Desk never writes to the vault.

## Use

1. Open **Run Desk** from the sidebar and choose **New template**. A template names the Entry id (copy it from the Handoff), the stage (`optimize`, `serve` or `implement`), the absolute path of a Modal script inside a git repo, its arguments, the GPU type, an hourly cost estimate, a max runtime and an optional W&B entity and project.
2. Choose **Launch**. The dialog shows the GPU, the hourly estimate, the max-runtime cap and the worst-case cost. Nothing starts until you choose **Launch and spend up to $X**. No agent tool can launch or stop a run.
3. The run list shows each run's status and estimated cost. Select a run to see its evidence, metrics and logs, or to stop it.

## The script contract

Run Desk runs `modal run --detach --name lh-run-desk-<run id> <script> <args>` from the script's folder, with these environment variables:

| Variable | Meaning |
| --- | --- |
| `LH_RUN_ID` | The Run Desk run id |
| `LH_GPU` | The template's GPU type, for `gpu=os.environ["LH_GPU"]` |
| `LH_MAX_RUNTIME_SECONDS` | The confirmed cap, for `timeout=int(os.environ["LH_MAX_RUNTIME_SECONDS"])` |

The remote function prints one final line to stdout with the stage fields and `outcome` (and `gap` on a failure that traces back to something not understood):

```python
print("LH_EVIDENCE " + json.dumps({"outcome": "pass", "metric": "step time", "unit": "ms", "better": "lower",
    "baseline": 41.8, "result": 33.5, "hardware": "1x NVIDIA L4", "why": "Fused the norm into the matmul."}))
```

Print it from the Modal function, not from a `local_entrypoint`, so the line reaches `modal app logs` even when LearnHarness was closed. Run Desk adds `schema`, `entry`, `stage`, `producedAt` (when it saw the app finish), `source` (the script's git repo and the `HEAD` commit at launch) and `command`, then validates the file with `gen-media/contracts/evidence/validate.mjs`.

| What the run printed | Run status | Evidence file |
| --- | --- | --- |
| A line that validates | `succeeded` | Written as printed |
| A line that breaks a consistency rule, such as a pass whose result does not beat the baseline | `failed` | Written as `outcome: "fail"` when that is valid |
| No line, bad JSON, or missing stage fields | `failed` | None. The run records why |

If wandb prints a `https://wandb.ai/<entity>/<project>/runs/<id>` URL in the logs, Run Desk keeps that run path. With a template W&B entity or project, only matching URLs count.

## Runs survive restarts

`data/runs.json` holds every run with a status that moves only `queued -> running -> succeeded | failed | stopped` (or `queued -> failed | stopped`). On activation, every 60 s, on **Refresh**, and when the local `modal run` process exits, Run Desk re-polls unfinished runs with `modal app list --json` and `modal app logs <app id>`. A run whose app id was never saved is found again by its app name. The max-runtime cap is enforced by that poll, so it holds only while LearnHarness runs. Use `LH_MAX_RUNTIME_SECONDS` as the Modal timeout to enforce it on Modal's side.

## W&B

Run Desk reads the summary and a sampled loss history from `https://api.wandb.ai/graphql` with the API key in `~/.netrc` (`machine api.wandb.ai`). Without that entry it shows "W&B not configured" and everything else keeps working.

## Agent tool

`run_report` is available to the teacher and practice agents. It is read-only and returns a run's status, cost estimate, evidence summary, final W&B metrics and a loss-curve summary. It defaults to the newest run, or the newest run for an `entryId`.

## Data

| Path under `data/` | Contents |
| --- | --- |
| `settings.json` | `modalPath`, default `~/.local/bin/modal` |
| `templates.json` | Run templates |
| `runs.json` | Runs and their status |
| `runs/<id>.launch.log`, `runs/<id>.modal.log` | Local `modal run` output and the final Modal logs |
| `evidence/<entry>/<stage>/<producedAt>.json` | Evidence files, append-only |

## Build and test

```sh
npm install
npm run typecheck && npm test
npm run build
node scripts/install-plugin-local.mjs "<plugins directory>"
```

Tests never contact Modal or W&B. `tests/fake-modal.mjs` stands in for the Modal CLI and runs the "remote" script locally with `python3`. `tests/fixtures/wandb-*.json` are hand-built GraphQL responses.

## Not yet proven against live services

- No real `modal run` has been launched, because launching spends money. The app id is read from the `View run at .../ap-...` line that `modal run` prints, and recovery assumes `modal app list --json` shows the `--name` value as `description`. Both match Modal CLI 1.6.1 source but were not observed on a real run.
- The W&B fixtures follow the public GraphQL schema (`summaryMetrics` as a JSON string, `sampledHistory(specs:)` as a list of row lists) but were not recorded from a live key.
- `modal app logs --tail 1000` must still contain the `LH_EVIDENCE` line. A run that prints more than 1000 lines after it is not supported.
