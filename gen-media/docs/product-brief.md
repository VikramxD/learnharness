# Product brief

The settled shared understanding from the design interview on 2026-11-26. Terms follow `../GLOSSARY.md`. Decisions with lasting cost are in `adr/`.

## Goal

Beat anyone at paper-to-production in video generation, image generation and RL for generative models: understand a paper or framework, implement it, optimize it against a baseline, and serve it in production. Frameworks are learned by using them, rebuilding their core, then using them again.

## What the product is

Its own product, with its own name, built on LearnHarness's core loop (ADR 0004). The fork owns the interface, the app structure and every feature around the loop. The core loop (probing, planning, teaching with checks, practice, graph extraction) stays upstream's and keeps being merged. It is built for one learner first, with settings rather than hardcoded personal paths.

## Interface

- T3 Code's design system and interaction model, copied from its MIT source with the copyright notice kept. The product keeps its own name, logo, app icon and accent color, and states once that the interface derives from T3 Code and is unofficial.
- A new shell beside upstream's screens, in folders the fork owns.
- Home is Today: the roadmap week, the next session to start, runs in flight.
- Session rendering is owned by the product: lesson text (typography, math, code, tables) and the message layout of lesson, checks, answers and side questions.
- The graph keeps its layout engine, is restyled to the product's look, and becomes ledger-aware: nodes colored by stage, grouped by lineage, clusters labelled with their paper or framework.
- One throwaway prototype of Today and the ledger, built with T3 Code's real components, comes before the real shell.

## Features

- Stage ledger, Material Desk, vault mirror with auto-sync, Handoffs, Run Desk and Focus become built-in features. Their plugin versions retire once the product runs daily.
- One-click Material sessions: a session starts with the paper or framework loaded and links itself to its Entry.
- A general MCP client configured in settings. Its tools reach agents through the same internal path plugin tools use, so the core loop is not edited. alphaXiv is the first server, signed in with an API key in the credential store.
- Agents get only alphaXiv's read-only research tools: `get_paper_content`, `answer_pdf_queries`, `discover_papers`, `read_files_from_github_repository`. Library changes happen only from the interface. `publish_paper` is excluded.
- The ledger stays the record of truth (ADR 0002). Adding a paper also saves it to an alphaXiv folder named after its lineage. Papers can be imported from the alphaXiv library and feeds. alphaXiv never changes the ledger on its own.
- The Build skill and Evidence files (ADR 0001) are unchanged.

## Order

1. Prototype Today and the ledger in T3 Code's style.
2. First usable version: Today, the ledger, one-click Material sessions, upstream's session screen restyled.
3. Then the MCP client with alphaXiv, Run Desk, vault and Focus as built-in features, session rendering, and the ledger-aware graph.

Runs from source until it is the daily app, then gets packaged.

## Open

- The product's name, logo and accent color.
