#!/usr/bin/env node
// Stop an isolated LearnHarness started by boot.mjs and delete its temp root.
// Usage: node teardown.mjs <state.json>
// Signals only the recorded pids, and only while each one's stdout still points
// into this root, so a recycled pid is never touched.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT_PREFIX } from "./boot.mjs";

/** Every process boot.mjs starts writes stdout into its root, so fd 1 identifies it. */
function ours(pid, realRoot) {
	try {
		const out = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "1", "-Fn"], { encoding: "utf8" });
		return out.split("\n").some((line) => line.startsWith(`n${realRoot}/`));
	} catch {
		return false;
	}
}

function signalGroup(pid, signal) {
	try {
		process.kill(-pid, signal);
	} catch {
		try { process.kill(pid, signal); } catch { /* already gone */ }
	}
}

const groupAlive = (pid) => {
	try {
		process.kill(-pid, 0);
		return true;
	} catch {
		return false;
	}
};

// Ownership is checked once, on the leader. A process group id cannot be reused
// while any member lives, so leftover members after the leader exits are ours.
async function stop(pid, realRoot, graceMs) {
	if (!ours(pid, realRoot)) return "absent";
	signalGroup(pid, "SIGTERM");
	const deadline = Date.now() + graceMs;
	while (Date.now() < deadline && groupAlive(pid)) await new Promise((r) => setTimeout(r, 100));
	if (!groupAlive(pid)) return "terminated";
	signalGroup(pid, "SIGKILL");
	return "killed";
}

/** A root is removable only if it is a direct child of the temp dir with boot's prefix. */
export function isRemovableRoot(root) {
	const resolved = path.resolve(root);
	return path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith(ROOT_PREFIX);
}

export async function teardown(statePath, { graceMs = 5000 } = {}) {
	const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
	const realRoot = fs.existsSync(state.root) ? fs.realpathSync(state.root) : state.root;
	const stopped = [];
	for (const pid of state.pids ?? []) stopped.push({ pid, result: await stop(pid, realRoot, graceMs) });
	if (!isRemovableRoot(state.root)) throw new Error(`refusing to remove ${state.root}: not a ${ROOT_PREFIX}* dir under ${os.tmpdir()}`);
	fs.rmSync(state.root, { recursive: true, force: true });
	return { stopped, removed: state.root };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const statePath = process.argv[2];
	if (!statePath) {
		console.error("usage: teardown.mjs <state.json>");
		process.exit(2);
	}
	const { stopped, removed } = await teardown(statePath);
	console.log(`stopped ${stopped.map((s) => `${s.pid}:${s.result}`).join(",") || "none"} removed=${removed}`);
}
