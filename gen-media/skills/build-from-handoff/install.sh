#!/usr/bin/env bash
set -euo pipefail
src="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$HOME/.claude/skills/build-from-handoff"
if [ -e "$dest" ] && [ ! -L "$dest" ]; then
	echo "$dest exists and is not a symlink. Move it away, then rerun." >&2
	exit 1
fi
mkdir -p "$HOME/.claude/skills"
ln -sfn "$src" "$dest"
echo "Linked $dest -> $src"
