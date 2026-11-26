import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTarget } from "../boot.mjs";

const isolation = { HOME: "/tmp/lh-verify-x/home", LH_DATA_DIR: "/tmp/lh-verify-x/data", PORT: "4100" };

test("released target runs the app binary as node with the title guard", () => {
	const launch = resolveTarget({ kind: "released", app: "/Apps/LH.app" }, isolation);
	assert.equal(launch.binary, "/Apps/LH.app/Contents/MacOS/LearnHarness");
	assert.deepEqual(launch.args, ["--require", "/Apps/LH.app/Contents/Resources/server-title-guard.cjs", "/Apps/LH.app/Contents/Resources/server/standalone/server.js"]);
	assert.equal(launch.cwd, "/Apps/LH.app/Contents/Resources/server/standalone");
	assert.deepEqual(launch.env, { ...isolation, ELECTRON_RUN_AS_NODE: "1" });
});

test("source target runs the repo's standalone server with host node and no electron env", () => {
	const launch = resolveTarget({ kind: "source", repo: "/src/fork" }, isolation);
	assert.equal(launch.binary, process.execPath);
	assert.deepEqual(launch.args, ["/src/fork/.next/standalone/server.js"]);
	assert.equal(launch.cwd, "/src/fork/.next/standalone");
	assert.deepEqual(launch.env, isolation);
});

test("an unknown target kind is rejected", () => {
	assert.throws(() => resolveTarget({ kind: "docker" }, isolation), /unknown boot target kind/);
});
