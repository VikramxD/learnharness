# The product

A learning product built on LearnHarness's core loop that trains one engineer, and later others, to take generative-media and RL research from paper to production better than anyone else. It keeps LearnHarness's teaching loop and owns everything around it.

## Language

**Core loop**:
LearnHarness's own teaching engine: probing, planning, teaching with checks, practice, and graph extraction. The product keeps it as upstream builds it.
_Avoid_: Engine, backend, LearnHarness (for the whole app)

**Today**:
The home screen: the current roadmap week, the next session to start, and runs in flight.
_Avoid_: Dashboard, home, feed


**Paper-to-production**:
The full chain of skill the plugins exist to train: understand a research paper, implement it, make the implementation optimal, and serve it in production.
_Avoid_: End-to-end, full stack

**Research stack**:
The papers, math and training code of generative media and RL for generative models.
_Avoid_: Theory side, ML side

**Production stack**:
The optimization, inference, serving and infrastructure that run those models for real users.
_Avoid_: Infra side, MLOps

## Roles

**Role profile**:
A target role described as Capability claims quoted from its job postings.
_Avoid_: Job, target, track

**Capability claim**:
One quoted requirement from a posting, with its URL and fetch date, linked to the Entries that would prove it.
_Avoid_: Skill, requirement, competency

**Cold check**:
An unassisted practice pass on an Entry at least seven days after it was taught, at hint rung R1 or lower. Understand counts only after one.
_Avoid_: Retest, review, quiz

## Stages

**Understand**:
The stage where the material feels obviously true, down to its derivations or design, and has passed a Cold check.
_Avoid_: Learn, read, study

**Implement**:
The stage where a correct implementation exists and matches the paper or a reference.
_Avoid_: Code, build

**Optimize**:
The stage where the implementation measurably beats a baseline on speed, memory or quality, and the reason is understood.
_Avoid_: Tune, improve, speed up

**Serve**:
The stage where the model runs behind an endpoint with known latency, throughput and cost.
_Avoid_: Deploy, ship, host

**Baseline**:
The measured reference an Optimize result is compared against.
_Avoid_: Benchmark, default

## Material

**Material**:
Anything taken through the stages. It is a Paper, a Framework, or Own work.
_Avoid_: Topic, content, resource

**Paper**:
A research publication taken through the stages.
_Avoid_: Article, preprint

**Own work**:
A concept, decision or problem from the learner's own projects, such as Auteur or Fictora.
_Avoid_: Project, side project

## Harness

**Harness**:
The feature that owns the Stage ledger, Material Desk, the vault mirror and Handoff writing. It began as a plugin.
_Avoid_: Core plugin, ledger plugin, LearnHarness (the app itself)

**Run Desk**:
The feature that launches GPU runs and writes their Evidence files, the same way a repo does.
_Avoid_: GPU plugin, Modal plugin

**Build skill**:
The Claude Code skill that reads a Handoff, builds in a repo, and writes Evidence files and Gap notes in the format the Stage ledger expects.
_Avoid_: Agent, integration

**Stage ledger**:
The record of where each piece of Material stands across the four stages, with the evidence for each stage.
_Avoid_: Tracker, progress, dashboard

**Entry**:
One piece of Material in the Stage ledger. Large Material, such as a Framework, splits into sub-entries that move through the stages on their own.
_Avoid_: Item, card, task

**Gap**:
A failure in Implement, Optimize or Serve that traces back to something not truly understood, which reopens Understand for that Entry.
_Avoid_: Decay, regression, review due

**Material Desk**:
The single intake for all Material: papers from arXiv and alphaXiv, Frameworks from pinned repo checkouts, and Own work from the vault.
_Avoid_: Paper Desk, library, reader

**Evidence file**:
A machine-written record in a repo that proves a stage outside LearnHarness, such as test results against a reference, a Baseline comparison, or serving metrics.
_Avoid_: Log, receipt, proof

**Handoff**:
A vault note that carries understood Material to Claude Code for building, naming the reference to match, the Baseline to beat and the Evidence file to write.
_Avoid_: Brief, ticket, task

**Framework**:
A state-of-the-art library that carries papers into practice, such as diffusers, TRL, vLLM or Triton.
_Avoid_: Tool, library, stack

**Rebuild**:
Writing a minimal version of a framework's core from scratch, after using the framework and before using it again with knowledge of its internals.
_Avoid_: Reimplement, clone, from-scratch build
