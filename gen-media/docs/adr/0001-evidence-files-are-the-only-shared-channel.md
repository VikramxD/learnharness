# Evidence files are the only channel between plugins and repos

LearnHarness plugins cannot call each other: a backend operation is reachable only from its own frontend, and plugin events reach only their own frontend. So the Stage ledger learns about Implement, Optimize and Serve only from Evidence files on disk, written in one versioned format (`contracts/evidence/`). Repos (through the Build skill) and Run Desk write them the same way, and Harness reads them from registered folders. Everything that touches the ledger directly lives inside the Harness plugin rather than in separate plugins sharing state files.

## Considered Options

- Separate Paper, Framework, Vault and Ledger plugins sharing JSON files: rejected, several writers to one ledger with no API between them.
- Logging stages by hand: rejected, a stage would count as done without proof.
- Inferring stages from git history: rejected, guesses are not evidence.
