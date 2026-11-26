# Handoff note format

Harness writes Handoff notes into the vault at `LearnHarness/Handoffs/<Project> - Handoff - <YYYY-MM-DD> - <Topic>.md`. The Build skill reads them and never edits them.

## Fields the Build skill reads

Read each field from the YAML frontmatter first. If a field is missing there, read the body section whose heading has the same name, such as `## Reference`.

| Field | Required | Meaning |
| --- | --- | --- |
| `entry` | always | The Entry id Harness assigned, such as `paper.2006.11239`. Copy it exactly. |
| `stage` | always | `implement`, `optimize` or `serve`. |
| `reference` | implement | What the implementation must match, such as a pinned library function and version. |
| `baseline` | optimize | What to beat and on which metric, such as `diffusers DDPMScheduler.step, wall time per step, lower is better`. |
| `target` | optional | A Serve or Optimize bar to meet, such as `p95 under 2000 ms at 8 concurrent requests`. |
| `repo` | optional | The repo to build in. Without it, use the current working directory. |
| `command` | optional | A suggested command. Run the command that actually produces the result, and record that one. |

The note also carries the vault fields `title`, `tags`, `project` and `status`. They do not affect the build.

## Example

```markdown
---
title: LearnHarness - Handoff - 2026-11-26 - DDPM noise schedule
tags: [learnharness, handoff]
project: LearnHarness
status: open
entry: paper.2006.11239
stage: implement
reference: diffusers DDPMScheduler 0.36, linear beta schedule, add_noise and epsilon loss
repo: ~/Documents/Projects/ddpm-from-scratch
---

# DDPM noise schedule

## What was understood

The forward process has a closed form, so x_t comes from x_0 in one step through alpha-bar.

## Evidence to write

An implement Evidence file with every test against the reference passing.
```
