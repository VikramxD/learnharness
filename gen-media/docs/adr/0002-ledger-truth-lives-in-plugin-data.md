# The Stage ledger's truth lives in Harness data, the vault is a mirror

Harness keeps the ledger in its own plugin data and validates every Evidence file before a stage changes. The Obsidian vault gets a read-only, regenerable mirror under `LearnHarness/`. We chose this over vault-frontmatter-as-truth (editable by Dataview and Claude Code) because a hand-edited note can claim a stage the evidence does not support. Claude Code writes Evidence files, never ledger rows.
