import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertIsolated } from "../isolation.mjs";

const fakeHome = (t) => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "isolation-home-"));
	t.after(() => fs.rmSync(home, { recursive: true, force: true }));
	return home;
};

test("refuses paths inside the profile, existing or not", (t) => {
	const home = fakeHome(t);
	const profile = path.join(home, "Library/Application Support/LearnHarness");
	assert.throws(() => assertIsolated(path.join(profile, "data"), home), /refusing/);
	fs.mkdirSync(path.join(profile, "data"), { recursive: true });
	assert.throws(() => assertIsolated(profile, home), /refusing/);
	assert.throws(() => assertIsolated(path.join(profile, "data/auth.json"), home), /refusing/);
});

test("refuses a symlink that leads into the profile", (t) => {
	const home = fakeHome(t);
	const profile = path.join(home, "Library/Application Support/LearnHarness");
	fs.mkdirSync(profile, { recursive: true });
	const link = path.join(home, "innocent");
	fs.symlinkSync(profile, link);
	assert.throws(() => assertIsolated(path.join(link, "data"), home), /refusing/);
});

test("accepts a temp dir and a sibling whose name only shares a prefix", (t) => {
	const home = fakeHome(t);
	assert.doesNotThrow(() => assertIsolated(fs.mkdtempSync(path.join(os.tmpdir(), "isolation-ok-")), home));
	assert.doesNotThrow(() => assertIsolated(path.join(home, "Library/Application Support/LearnHarness-dev/data"), home));
});
