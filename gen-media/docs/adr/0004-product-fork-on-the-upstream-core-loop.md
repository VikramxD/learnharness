# A product fork built on the upstream core loop

Supersedes ADR 0003. The gen-media work is now its own product with its own name, built on LearnHarness rather than plugged into it. Plugins cannot start sessions, talk to each other, or change the app's shell and navigation, and the product needs all three. So the fork owns the interface, the app structure, and first-class features in the server and storage. The core loop stays upstream's: the prober, planner, teacher and practice agents, their prompts and the teaching method, and graph extraction. We keep merging upstream so improvements to the loop keep flowing in. A change the product needs inside the core loop goes through the narrowest possible seam and is offered upstream as a pull request. The product is built for one learner first, but uses settings rather than hardcoded personal paths so it can be shared.

## Considered Options

- Plugins only (ADR 0003): rejected, the plugin API cannot carry a redesigned shell or cross-feature flows.
- A hard fork that also owns the teaching loop: rejected, the loop is where upstream invests most and what the learner wants to keep.
- Owning the loop and the interface while keeping only infrastructure: rejected for the same reason.
