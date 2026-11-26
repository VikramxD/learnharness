#!/usr/bin/env bash
# Fast-forward the fork's main to upstream/main, then merge it into gen-media.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "working tree is dirty; commit or stash first" >&2; exit 1; }

gh repo sync VikramxD/learnharness --source amosblomqvist/learnharness --branch main
git fetch origin upstream --prune
git switch main
git merge --ff-only origin/main

git switch gen-media
before=$(git rev-parse HEAD)
git merge --no-edit main
if [ "$before" = "$(git rev-parse HEAD)" ]; then
	echo "gen-media already contains upstream main"
	exit 0
fi
npm ci --silent
npm run plugins:setup --silent
npm test
git push origin main gen-media
echo "synced: $(git log --oneline -1 main)"
