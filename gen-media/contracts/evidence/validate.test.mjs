import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateEvidence, evidenceFileName } from "./validate.mjs";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8"));

test("every example is valid", () => {
	for (const name of fs.readdirSync(new URL("./examples/", import.meta.url))) {
		const result = validateEvidence(read(name));
		assert.deepEqual(result.ok ? [] : result.errors, [], name);
	}
});

test("implement cannot pass with a failing test", () => {
	const e = { ...read("implement-pass.json"), tests: { passed: 13, total: 14 } };
	assert.deepEqual(validateEvidence(e).errors, ["implement passes only when every test passed."]);
});

test("optimize cannot pass without beating baseline", () => {
	const e = { ...read("optimize-pass.json"), result: 41.8 };
	assert.deepEqual(validateEvidence(e).errors, ["optimize passes only when result beats baseline."]);
});

test("a gap needs a failure", () => {
	const e = { ...read("serve-fail-gap.json"), outcome: "pass" };
	assert.ok(validateEvidence(e).errors.includes("gap is allowed only when outcome is fail."));
});

test("entry ids follow Harness conventions", () => {
	const e = { ...read("implement-pass.json"), entry: "ddpm" };
	assert.match(validateEvidence(e).errors[0], /entry must be a Harness entry id/);
});

test("file names come from producedAt", () => {
	assert.equal(evidenceFileName("2026-12-14T10:22:05.123Z"), "20261214T102205Z.json");
});
