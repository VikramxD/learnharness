#!/usr/bin/env node
// Fails when the fork changes an upstream file it does not own, so upstream merges stay conflict-free.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
const lines = (text) => text.split("\n").filter(Boolean);

export function upstreamTouch(cwd) {
	const root = git(cwd, "rev-parse", "--show-toplevel").trim();
	const config = JSON.parse(fs.readFileSync(path.join(root, "gen-media/upstream-touch.json"), "utf8"));
	const base = git(root, "merge-base", "upstream/main", "HEAD").trim();
	const changed = [...new Set([
		...lines(git(root, "diff", "--name-only", "--no-renames", base)),
		...lines(git(root, "ls-files", "--others", "--exclude-standard")),
	])].sort();
	const allowed = new Set(config.allowed.map((entry) => entry.path));
	const violations = changed.filter((file) => !allowed.has(file) && !config.owned.some((prefix) => file.startsWith(prefix)));
	return { base, changed, violations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { base, changed, violations } = upstreamTouch(process.cwd());
	if (violations.length) {
		console.error(`upstream-touch: ${violations.length} upstream file(s) changed outside fork-owned paths (base ${base.slice(0, 12)}):`);
		for (const file of violations) console.error(`  ${file}`);
		console.error("Move the change under an owned prefix, or add {path, why} to gen-media/upstream-touch.json allowed.");
		process.exit(1);
	}
	console.log(`upstream-touch: ok, ${changed.length} changed file(s) all fork-owned (base ${base.slice(0, 12)})`);
}
