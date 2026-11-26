#!/usr/bin/env node
// End-to-end proof of the harness: plugin view, backend call, seeded graph, scripted model turn.
// Usage: node tools/verify/examples/smoke.mjs --out <screenshot dir> [--plugins <extra plugin dirs, comma-separated>]
import assert from "node:assert/strict";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { boot } from "../boot.mjs";
import { teardown } from "../teardown.mjs";
import { seedGraph } from "../seed-graph.mjs";
import { callPlugin, click, fill, open, screenshot, waitFor } from "../drive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { out: { type: "string" }, plugins: { type: "string", default: "" } } });
assert(values.out, "--out <dir> is required");
const extra = values.plugins.split(",").filter(Boolean).map((p) => path.resolve(p));

const state = await boot({
	plugins: [path.join(HERE, "../fixtures/echo-plugin"), ...extra],
	script: path.join(HERE, "../fixtures/fake-tool-turn.json"),
});
console.log(`ready ${state.url} plugins=${state.plugins.map((p) => `${p.id}:${p.status}`).join(",")}`);
let session;
try {
	const echoed = await callPlugin(state.url, "verify-echo", "echo", { ping: 1 });
	assert.deepEqual(echoed.echoed, { ping: 1 }, "backend op returns its input");
	assert(echoed.dataDirectory.startsWith(state.dataDir), "plugin data dir is inside the isolated root");
	console.log("backend echo ok");

	const seeded = seedGraph(state.dataDir);
	session = await open(state.url);
	await waitFor(session.page, "role=button[name='Chains']");
	await session.page.waitForTimeout(1500);
	console.log("graph canvas", await screenshot(session.page, path.join(values.out, "graph-canvas.png")));
	await click(session.page, "role=button[name='Chains']");
	await waitFor(session.page, "text=3 chains · 5 nodes");
	console.log("graph", await screenshot(session.page, path.join(values.out, "graph-chains.png")));
	await session.page.keyboard.press("Escape");

	if (extra.some((p) => p.includes("hello-plugin"))) {
		await click(session.page, "text=Open hello view");
		await waitFor(session.page, "text=Hello from an external plugin");
		console.log("hello view", await screenshot(session.page, path.join(values.out, "hello-view.png")));
	}

	await session.page.goto(state.url, { waitUntil: "domcontentloaded" });
	await fill(session.page, "role=textbox[name='What do you want to learn?']", "Teach me flow matching");
	await click(session.page, "role=button[name='Start session']");
	await waitFor(session.page, "text=Scripted reply after a tool call", { timeout: 30_000 });
	console.log("scripted turn", await screenshot(session.page, path.join(values.out, "fake-model-turn.png")));
	console.log(`seeded chat ${seeded.chatId}`);
} finally {
	await session?.close();
	const result = await teardown(state.statePath);
	console.log(`teardown ${result.stopped.map((s) => `${s.pid}:${s.result}`).join(",")}`);
}
