import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Captured at import, before anything can swap HOME for a sandbox home.
const REAL_HOME = os.homedir();

function realpathOfNearestAncestor(target) {
	const missing = [];
	let current = path.resolve(target);
	while (!fs.existsSync(current)) {
		missing.unshift(path.basename(current));
		current = path.dirname(current);
	}
	return path.join(fs.realpathSync(current), ...missing);
}

// APFS is case-insensitive by default, so "learnharness" names the same profile.
const comparable = (p) => (process.platform === "darwin" ? p.toLowerCase() : p);

export function assertIsolated(target, home = REAL_HOME) {
	const profile = comparable(realpathOfNearestAncestor(path.join(home, "Library/Application Support/LearnHarness")));
	const resolved = comparable(realpathOfNearestAncestor(target));
	const relative = path.relative(profile, resolved);
	if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
		throw new Error(`refusing ${target}: it is inside the real LearnHarness profile ${profile}`);
	}
}
