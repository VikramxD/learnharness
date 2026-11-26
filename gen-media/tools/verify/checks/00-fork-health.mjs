#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, RELEASED_APP } from "../boot.mjs";
import { teardown } from "../teardown.mjs";

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: path.dirname(fileURLToPath(import.meta.url)), encoding: "utf8" }).trim();
const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

async function withBoot(options, fn) {
	const state = await boot(options);
	try {
		return await fn(state);
	} finally {
		await teardown(state.statePath);
	}
}

await withBoot({ source: repo }, async (state) => {
	const res = await fetch(`${state.url}/api/product/health`);
	assert.equal(res.status, 200, "fork serves /api/product/health");
	const body = await res.json();
	assert.equal(body.product, "gen-media");
	assert.equal(body.commit, head, "health names the booted HEAD");
	console.log(`ok   source ${state.url} /api/product/health -> 200 ${JSON.stringify(body)}`);
});

if (fs.existsSync(RELEASED_APP)) {
	await withBoot({}, async (state) => {
		const res = await fetch(`${state.url}/api/product/health`);
		assert.equal(res.status, 404, "released app has no product health route");
		console.log(`ok   released ${state.url} /api/product/health -> 404`);
	});
} else {
	console.log(`skip released: ${RELEASED_APP} not installed`);
}
