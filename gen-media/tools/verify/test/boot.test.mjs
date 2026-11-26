import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { boot, freePort } from "../boot.mjs";
import { isRemovableRoot, teardown } from "../teardown.mjs";

const ECHO = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/echo-plugin");

const listening = (port) =>
	new Promise((resolve) => {
		const socket = net.connect(port, "127.0.0.1");
		socket.once("connect", () => (socket.destroy(), resolve(true)));
		socket.once("error", () => resolve(false));
	});

const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

test("boot serves an active plugin from an isolated root and teardown removes every trace", async () => {
	const state = await boot({ plugins: [ECHO] });
	try {
		assert.deepEqual(state.plugins, [{ id: "verify-echo", status: "active" }]);
		assert.equal(path.dirname(state.root), path.resolve(os.tmpdir()));
		assert(await listening(state.port), "server listens on its port");
		assert.deepEqual(JSON.parse(fs.readFileSync(state.statePath, "utf8")).pids, state.pids);
		assert.equal(JSON.parse(fs.readFileSync(path.join(state.dataDir, "settings.json"), "utf8")).general.autoUpdate, false);
	} finally {
		await teardown(state.statePath);
	}
	assert(!(await listening(state.port)), "no listener after teardown");
	assert(state.pids.every((pid) => !alive(pid)), "recorded pids are gone");
	assert(!fs.existsSync(state.root), "temp root removed");
});

test("boot with zero plugins still waits for a serving server", async () => {
	const state = await boot({});
	try {
		assert.deepEqual(state.plugins, []);
		assert.equal(state.target.kind, "released");
		assert.equal((await fetch(`${state.url}/api/plugins`)).status, 200);
	} finally {
		await teardown(state.statePath);
	}
});

test("two boots run side by side on different ports", async () => {
	const [a, b] = await Promise.all([boot({ plugins: [ECHO] }), boot({ plugins: [ECHO] })]);
	try {
		assert.notEqual(a.port, b.port);
		assert.notEqual(a.root, b.root);
		assert(await listening(a.port));
		assert(await listening(b.port));
	} finally {
		await Promise.all([teardown(a.statePath), teardown(b.statePath)]);
	}
	assert(!(await listening(a.port)) && !(await listening(b.port)));
});

test("teardown of one instance leaves a sibling running", async () => {
	const [a, b] = await Promise.all([boot({ plugins: [ECHO] }), boot({ plugins: [ECHO] })]);
	try {
		await teardown(a.statePath);
		assert(!(await listening(a.port)));
		assert(await listening(b.port), "sibling still serving");
	} finally {
		await teardown(b.statePath);
	}
});

test("a requested port that is taken fails fast without leaving a root behind", async () => {
	const port = await freePort();
	const blocker = net.createServer().listen(port, "127.0.0.1");
	await new Promise((r) => blocker.once("listening", r));
	const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("lh-verify-"));
	try {
		await assert.rejects(boot({ plugins: [ECHO], port }), /already in use/);
	} finally {
		blocker.close();
	}
	const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("lh-verify-"));
	assert.deepEqual(after.filter((d) => !before.includes(d)), []);
});

test("a missing manifest is rejected before anything starts", async () => {
	await assert.rejects(boot({ plugins: [os.tmpdir()] }), /No manifest.json/);
});

test("teardown refuses to delete anything outside a lh-verify temp root", () => {
	assert(!isRemovableRoot(os.homedir()));
	assert(!isRemovableRoot(path.join(os.homedir(), "Library/Application Support/LearnHarness")));
	assert(!isRemovableRoot(path.join(os.tmpdir(), "other-dir")));
	assert(isRemovableRoot(path.join(os.tmpdir(), "lh-verify-abc123")));
});
