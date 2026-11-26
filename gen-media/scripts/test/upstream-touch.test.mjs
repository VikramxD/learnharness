import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../upstream-touch.mjs");

function fixtureRepo(t) {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-touch-"));
	t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
	const write = (file, text) => {
		fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
		fs.writeFileSync(path.join(repo, file), text);
	};
	git("init", "-q", "-b", "main");
	write("components/chat.tsx", "upstream\n");
	git("add", "-A");
	git("commit", "-q", "-m", "upstream");
	git("update-ref", "refs/remotes/upstream/main", "HEAD");
	write("gen-media/upstream-touch.json", JSON.stringify({ owned: ["gen-media/", "app/api/product/"], allowed: [] }));
	git("add", "-A");
	git("commit", "-q", "-m", "fork");
	return { repo, write };
}

const run = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });

test("passes when every change is under an owned prefix, committed or untracked", (t) => {
	const { repo, write } = fixtureRepo(t);
	write("app/api/product/health/route.ts", "fork\n");
	const result = run(repo);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /ok, 2 changed file/);
});

test("names a working-tree edit to an upstream file and an untracked scratch file", (t) => {
	const { repo, write } = fixtureRepo(t);
	write("components/chat.tsx", "upstream\nscratch\n");
	write("components/scratch.tsx", "scratch\n");
	const result = run(repo);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /components\/chat\.tsx/);
	assert.match(result.stderr, /components\/scratch\.tsx/);
	assert.doesNotMatch(result.stderr, /^  gen-media\//m);
});

test("an allowed entry lets a named upstream file through", (t) => {
	const { repo, write } = fixtureRepo(t);
	write("gen-media/upstream-touch.json", JSON.stringify({ owned: ["gen-media/"], allowed: [{ path: "components/chat.tsx", why: "test" }] }));
	write("components/chat.tsx", "upstream\nedited\n");
	assert.equal(run(repo).status, 0);
});
