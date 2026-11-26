---
name: build-from-handoff
description: This skill should be used when the user gives a LearnHarness Handoff note, such as a path under "LearnHarness/Handoffs/", or asks to "build from this handoff", "implement this handoff", "pick up the handoff", "beat the baseline in this handoff", "serve this entry", "record evidence for paper.2006.11239", or "write an Evidence file" for the Stage ledger. It builds in the user's repo test-first against the named reference, runs the exact command, and records every attempt, pass or fail, as an Evidence file with a Gap when the failure is conceptual.
---

# Build from a Handoff

A Handoff note carries understood Material from LearnHarness to a repo. Build what it asks for, run the exact command, and record the result as an Evidence file. Harness reads that file and moves the Stage ledger. The format is `contracts/evidence/README.md` in the LearnHarness plugins repo.

## Rules

- Read the Handoff. Never edit it, any other vault note under `LearnHarness/`, or Harness plugin data. The ledger moves only from Evidence files.
- Copy the Entry id from the Handoff. Never invent one.
- Write Evidence files only with `scripts/write-evidence` in this skill's directory. Never write or edit JSON under `evidence/` by hand.
- Record every attempt that ran the command, pass or fail. A new attempt is a new file.

## 1. Read the Handoff

Read the fields in `references/handoff-format.md`: `entry`, `stage`, `reference`, `baseline`, `target` and `repo`. If `entry` or `stage` is missing, stop and ask the user. Work in `repo`, or the current directory when the note names none. It must be a git repo.

## 2. Build for the stage

### Implement

Work test-first against the reference.

1. Write a test that runs the reference and the new code on the same fixed inputs and seeds, and compares outputs with a stated tolerance, such as `torch.testing.assert_close(ours, ref, rtol=1e-5, atol=1e-6)`. Compare numbers, not shapes alone.
2. Run it and watch it fail for the expected reason.
3. Implement until it passes. Add one test per behavior the Handoff names.
4. Read `tests.passed` and `tests.total` from the runner's summary line.

### Optimize

1. Measure the Baseline first, on the same machine, inputs, dtype and shapes as the candidate.
2. Run one benchmark command that interleaves baseline and candidate: B, C, B, C, at least five pairs, after warmup runs that are discarded. Synchronize the device before reading a timer. Record the median of each side.
3. If the spread between runs is larger than the gap between medians, the result is noise. Record a fail.
4. Find what limited the Baseline and what the candidate changed, with a profiler or a roofline estimate. Write that as `why`, one sentence.
5. A win you cannot explain is not a pass. Record it as a fail with a Gap whose concept is the mechanism you could not explain.

`--hardware` names the exact device, such as `1x NVIDIA L4` or `Apple M3 Max 64 GB`. `--baseline` and `--result` are the two medians.

### Serve

1. Start the model behind a real HTTP endpoint. Do not call the model in-process and do not mock the server.
2. Drive it with a load generator over HTTP. Discard warmup requests, then send enough requests for a stable p95 (at least 200).
3. Compute p50 and p95 from per-request latencies in milliseconds. Throughput is completed requests per second, or a unit that fits the output, such as `images/s`.
4. Cost per 1k is `hourly price / 3600 / throughput * 1000` in USD. Use the provider's on-demand price for the hardware and name the provider in the report.
5. The run fails if any request errors, or if it misses the Handoff's `target`.

## 3. Record the result

1. Commit the attempt. The CLI refuses a tree with uncommitted changes outside `evidence/`, because `source.commit` must be the code that ran.
2. Run the command and keep its output.
3. Record it from that run's output. Copy test counts and numbers from the output, or pass the benchmark's JSON with `--from-json`. Never type them from memory. A command that exited non-zero is a fail. The CLI fills `schema`, `producedAt` and `source` from git, validates, and prints the path it wrote.

```bash
W="<this skill's directory>/scripts/write-evidence"

"$W" --repo . --entry paper.2006.11239 --stage implement --outcome pass \
  --command "uv run pytest tests/test_against_diffusers.py" \
  --reference "diffusers DDPMScheduler 0.36" --tests-passed 14 --tests-total 14

"$W" --repo . --entry framework.sglang.rmsnorm-kernel --stage optimize --outcome pass \
  --command "uv run python bench/rmsnorm.py --interleave 7" \
  --metric "kernel time" --unit us --better lower --baseline 41.8 --result 33.5 \
  --hardware "1x NVIDIA L4" --why "One pass over the row with a fused reduction instead of two reads."

"$W" --repo . --entry framework.sglang.radix-cache --stage serve --outcome fail \
  --command "uv run python bench/serve.py --requests 500" \
  --endpoint http://127.0.0.1:30000/v1/chat/completions --hardware "1x NVIDIA L4" \
  --p50-ms 412 --p95-ms 1880 --throughput 9.4 --throughput-unit requests/s --cost-per-1k-usd 0.21 \
  --gap-concept "radix cache eviction" --gap-why "Evicted shared prefixes in LRU order without reference counts."
```

`--from-json <file>` reads stage fields from a file a benchmark wrote. Flags override it. `--help` lists every flag.

On a non-zero exit, the CLI prints every error. Fix the input or rerun the attempt. If the CLI refuses a pass, such as 13 of 14 tests, the attempt is a fail. Record it as one.

4. Commit the Evidence file on its own.

## 4. Gap or no Gap

A Gap reopens Understand for the Entry, so the learner gets taught the concept again. Add a Gap only to a fail, and only when the cause is conceptual.

The failure is conceptual when the explanation you would give of the method is itself wrong. A correct explanation, said out loud before coding, would have predicted the failure. The fix changes your model of the method, and the same bug would come back in a clean rewrite.

The failure is mechanical when your model was right and the code did not follow it. Typos, off-by-one indexing, wrong dtype or device, a missing dependency, a bad path, an out-of-memory error from a batch size, or a flaky machine are mechanical. Fix them and run again.

| Failure | Gap |
| --- | --- |
| Loss diverges from the reference because the model predicts x_0 while the loss assumes epsilon, believing the two are interchangeable without reweighting | concept `epsilon vs x_0 parameterization`, why: they weight timesteps differently, so the losses are not equal |
| Noised samples differ because `alphas_cumprod[t]` was indexed with `t + 1` by a typo | none |
| A fused kernel is slower than the Baseline because the op was compute-bound, not memory-bound | concept `roofline: compute-bound vs memory-bound`, why: fusion saves memory traffic the op was not limited by |
| A speedup that vanished once `torch.cuda.synchronize()` was added before the timer | none, fix the timing and rerun |
| p95 explodes under shared prefixes because cached prefixes are evicted in LRU order while requests still use them | concept `radix cache eviction`, why: eviction ignored reference counts |
| The server crashes at start with an out-of-memory error because the memory fraction was set too high | none |
| A real speedup, measured cleanly, that you cannot explain | concept is the mechanism, why: the result has no explanation yet |

Write `--gap-concept` as the short name a teacher would teach, such as `classifier-free guidance scale`. Write `--gap-why` as one sentence on what you believed, what is true, and the observation that showed it.

If two mechanical fixes in a row fail on the same symptom, treat the cause as conceptual. When still unsure, write the Gap. A false Gap costs one teaching session. A missed one leaves the wrong model in every later stage.

## 5. Report

Tell the user the Evidence file path, the outcome, the numbers, and the Gap if there is one. For Optimize, also give the Baseline, the `why`, and the run spread. For Serve, give the price source. Leave the Handoff note's `status` alone. Harness updates it.
