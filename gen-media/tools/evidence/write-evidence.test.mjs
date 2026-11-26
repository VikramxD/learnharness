import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidence } from "../../contracts/evidence/validate.mjs";

const CLI = fileURLToPath(new URL("./write-evidence.mjs", import.meta.url));

function scratchRepo() {
	const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "write-evidence-")));
	const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "test");
	fs.writeFileSync(path.join(dir, "model.py"), "x = 1\n");
	git("add", ".");
	git("commit", "-qm", "init");
	return { dir, head: git("rev-parse", "HEAD") };
}

function run(args) {
	const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
	return { code: r.status, stdout: r.stdout.trim(), errors: r.stderr.trim().split("\n").filter(Boolean) };
}

const implementPass = (repo) => [
	"--repo", repo, "--entry", "paper.2006.11239", "--stage", "implement", "--outcome", "pass",
	"--command", "uv run pytest tests/test_against_diffusers.py",
	"--reference", "diffusers DDPMScheduler 0.36", "--tests-passed", "14", "--tests-total", "14",
];

const optimizePass = (repo) => [
	"--repo", repo, "--entry", "framework.sglang.rmsnorm-kernel", "--stage", "optimize", "--outcome", "pass",
	"--command", "uv run python bench/rmsnorm.py", "--metric", "kernel time", "--unit", "us", "--better", "lower",
	"--baseline", "41.8", "--result", "33.5", "--hardware", "1x NVIDIA L4", "--why", "Fused reduction, one read of the row.",
];

const serveFail = (repo) => [
	"--repo", repo, "--entry", "framework.sglang.radix-cache", "--stage", "serve", "--outcome", "fail",
	"--command", "uv run python bench/serve.py", "--endpoint", "http://127.0.0.1:30000/v1/chat/completions",
	"--hardware", "1x NVIDIA L4", "--p50-ms", "412", "--p95-ms", "1880", "--throughput", "9.4",
	"--throughput-unit", "requests/s", "--cost-per-1k-usd", "0.21",
	"--gap-concept", "radix cache eviction", "--gap-why", "Evicted shared prefixes without reference counts.",
];

const withFlag = (args, flag, value) => {
	const i = args.indexOf(flag);
	return i === -1 ? [...args, flag, value] : args.toSpliced(i + 1, 1, value);
};

function readWritten(stdout) {
	const evidence = JSON.parse(fs.readFileSync(stdout, "utf8"));
	assert.deepEqual(validateEvidence(evidence).errors ?? [], [], "written file validates");
	return evidence;
}

const without = (args, ...flags) => args.filter((_, i) => !flags.includes(args[i]) && !flags.includes(args[i - 1]));
const servePass = (repo) => withFlag(without(serveFail(repo), "--gap-concept", "--gap-why"), "--outcome", "pass");

const evidenceFiles = (repo) => (fs.existsSync(path.join(repo, "evidence")) ? fs.readdirSync(path.join(repo, "evidence"), { recursive: true }).filter((f) => f.endsWith(".json")) : []);

test("implement pass writes a valid file under evidence/<entry>/<stage>/ with the HEAD commit", () => {
	const { dir, head } = scratchRepo();
	const r = run(implementPass(dir));
	assert.equal(r.code, 0, r.errors.join("\n"));
	assert.match(r.stdout, new RegExp(`^${dir}/evidence/paper\\.2006\\.11239/implement/\\d{8}T\\d{6}Z\\.json$`));
	const e = readWritten(r.stdout);
	assert.equal(e.schema, "lh-evidence/1");
	assert.deepEqual(e.source, { repo: dir, commit: head });
	assert.deepEqual(e.tests, { passed: 14, total: 14 });
	assert.equal(path.basename(r.stdout), `${e.producedAt.replace(/[-:]/g, "")}.json`);
	assert.ok(Math.abs(Date.parse(e.producedAt) - Date.now()) < 60_000, "producedAt is now");
});

test("optimize pass and serve fail with gap write valid files", () => {
	const { dir } = scratchRepo();
	const opt = run(optimizePass(dir));
	assert.equal(opt.code, 0, opt.errors.join("\n"));
	assert.equal(readWritten(opt.stdout).baseline, 41.8);
	const serve = run(serveFail(dir));
	assert.equal(serve.code, 0, serve.errors.join("\n"));
	const e = readWritten(serve.stdout);
	assert.deepEqual(e.gap, { concept: "radix cache eviction", why: "Evicted shared prefixes without reference counts." });
	assert.deepEqual(e.throughput, { value: 9.4, unit: "requests/s" });
	assert.deepEqual(e.costPer1k, { usd: 0.21 });
});

test("--repo in a subdirectory records and writes at the repo root", () => {
	const { dir } = scratchRepo();
	fs.mkdirSync(path.join(dir, "src"));
	const r = run(withFlag(implementPass(dir), "--repo", path.join(dir, "src")));
	assert.equal(r.code, 0, r.errors.join("\n"));
	assert.ok(r.stdout.startsWith(`${dir}/evidence/`));
	assert.equal(readWritten(r.stdout).source.repo, dir);
});

test("--from-json supplies stage fields and flags override it", () => {
	const { dir } = scratchRepo();
	const json = path.join(os.tmpdir(), `bench-${process.pid}.json`);
	fs.writeFileSync(json, JSON.stringify({ metric: "step time", unit: "ms", better: "lower", baseline: 10, result: 12, hardware: "M3 Max", why: "Compiled graph." }));
	const r = run(["--repo", dir, "--entry", "paper.2006.11239", "--stage", "optimize", "--outcome", "pass", "--command", "python bench.py", "--from-json", json, "--result", "8"]);
	assert.equal(r.code, 0, r.errors.join("\n"));
	const e = readWritten(r.stdout);
	assert.equal(e.metric, "step time");
	assert.equal(e.result, 8);
});

test("--from-json cannot set fields the CLI fills", () => {
	const { dir } = scratchRepo();
	const json = path.join(os.tmpdir(), `forged-${process.pid}.json`);
	fs.writeFileSync(json, JSON.stringify({ reference: "r", tests: { passed: 1, total: 1 }, source: { repo: "x", commit: "y" }, producedAt: "2020-01-01T00:00:00Z" }));
	const r = run(["--repo", dir, "--entry", "paper.2006.11239", "--stage", "implement", "--outcome", "pass", "--command", "pytest", "--from-json", json]);
	assert.equal(r.code, 1);
	assert.deepEqual(r.errors, ["--from-json cannot set producedAt; the CLI fills it.", "--from-json cannot set source; the CLI fills it."]);
});

const refusals = [
	["implement passes only when every test passed", (d) => withFlag(implementPass(d), "--tests-passed", "13"), ["implement passes only when every test passed."]],
	["implement cannot pass with zero tests", (d) => withFlag(withFlag(implementPass(d), "--tests-passed", "0"), "--tests-total", "0"), ["implement passes only when every test passed."]],
	["implement tests must be whole numbers with passed <= total", (d) => withFlag(implementPass(d), "--tests-passed", "15"), ["implement needs tests with passed <= total, both whole numbers."]],
	["implement needs reference", (d) => without(implementPass(d), "--reference"), ["implement needs reference."]],
	["optimize lower-is-better must go down", (d) => withFlag(optimizePass(d), "--result", "41.8"), ["optimize passes only when result beats baseline."]],
	["optimize higher-is-better must go up", (d) => withFlag(optimizePass(d), "--better", "higher"), ["optimize passes only when result beats baseline."]],
	["optimize numbers must be numeric", (d) => withFlag(optimizePass(d), "--baseline", "fast"), ["optimize needs numeric baseline and result."]],
	["optimize better is lower or higher", (d) => withFlag(optimizePass(d), "--better", "faster"), ['optimize needs better as "lower" or "higher".', "optimize passes only when result beats baseline."]],
	["optimize needs why", (d) => without(optimizePass(d), "--why"), ["optimize needs metric, unit, hardware and why."]],
	["serve pass needs p95 >= p50", (d) => withFlag(servePass(d), "--p95-ms", "100"), ["serve passes only with p50Ms > 0 and p95Ms >= p50Ms."]],
	["serve pass needs p50 > 0", (d) => withFlag(servePass(d), "--p50-ms", "0"), ["serve passes only with p50Ms > 0 and p95Ms >= p50Ms."]],
	["serve pass needs positive throughput", (d) => withFlag(servePass(d), "--throughput", "0"), ["serve passes only with positive throughput."]],
	["serve pass needs non-negative cost", (d) => withFlag(servePass(d), "--cost-per-1k-usd", "-1"), ["serve passes only with a non-negative cost."]],
	["serve needs throughput unit", (d) => without(serveFail(d), "--throughput-unit"), ["serve needs throughput with value and unit."]],
	["gap only on fail", (d) => withFlag(serveFail(d), "--outcome", "pass"), ["gap is allowed only when outcome is fail."]],
	["gap needs concept and why", (d) => without(serveFail(d), "--gap-why"), ["gap must have concept and why."]],
	["entry must be a Harness id", (d) => withFlag(implementPass(d), "--entry", "ddpm"), ["entry must be a Harness entry id, such as paper.2006.11239."]],
	["stage must be known", (d) => withFlag(implementPass(d), "--stage", "understand"), ["--reference does not belong to stage understand.", "--tests-passed does not belong to stage understand.", "--tests-total does not belong to stage understand.", "stage must be one of implement, optimize, serve."]],
	["outcome is pass or fail", (d) => withFlag(implementPass(d), "--outcome", "ok"), ['outcome must be "pass" or "fail".']],
	["command is required", (d) => without(implementPass(d), "--command"), ["command must name the exact command that produced the result."]],
	["flags from another stage are refused", (d) => [...implementPass(d), "--metric", "x"], ["--metric does not belong to stage implement."]],
	["unknown flags are refused", (d) => [...implementPass(d), "--colour", "x"], ["Unknown flag --colour."]],
	["a flag needs a value", (d) => [...implementPass(d), "--why"], ["--why needs a value."]],
];

for (const [name, args, expected] of refusals) {
	test(`refuses: ${name}`, () => {
		const { dir } = scratchRepo();
		const r = run(args(dir));
		assert.equal(r.code, 1);
		assert.deepEqual(r.errors, expected);
		assert.equal(r.stdout, "");
		assert.deepEqual(evidenceFiles(dir), [], "nothing written");
	});
}

test("lists every error at once", () => {
	const { dir } = scratchRepo();
	const r = run(["--repo", dir, "--entry", "ddpm", "--stage", "optimize", "--outcome", "pass", "--command", "x", "--baseline", "1", "--result", "2", "--better", "lower"]);
	assert.equal(r.code, 1);
	assert.deepEqual(r.errors, [
		"entry must be a Harness entry id, such as paper.2006.11239.",
		"optimize needs metric, unit, hardware and why.",
		"optimize passes only when result beats baseline.",
	]);
});

test("refuses a dirty tree, ignoring evidence/", () => {
	const { dir } = scratchRepo();
	fs.mkdirSync(path.join(dir, "evidence"));
	fs.writeFileSync(path.join(dir, "evidence", "old.json"), "{}");
	assert.equal(run(implementPass(dir)).code, 0, "untracked evidence/ is not dirt");
	fs.writeFileSync(path.join(dir, "model.py"), "x = 2\n");
	const r = run(implementPass(dir));
	assert.equal(r.code, 1);
	assert.deepEqual(r.errors, [`${dir} has uncommitted changes outside evidence/. Commit the attempt, rerun the command, then record it.`]);
});

test("refuses a path that is not a git repo with a commit", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "not-git-"));
	const r = run(implementPass(dir));
	assert.equal(r.code, 1);
	assert.match(r.errors[0], /is not inside a git repo with a commit/);
	assert.equal(r.errors.length, 1);
});

test("refuses a missing --repo", () => {
	const r = run(without(implementPass("x"), "--repo"));
	assert.equal(r.code, 1);
	assert.deepEqual(r.errors, ["--repo is required."]);
});

test("install.sh links the skill into HOME and the shim records through the link", () => {
	const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "home-")));
	const install = fileURLToPath(new URL("../../skills/build-from-handoff/install.sh", import.meta.url));
	const env = { ...process.env, HOME: home };
	execFileSync(install, { env });
	execFileSync(install, { env });
	const link = path.join(home, ".claude", "skills", "build-from-handoff");
	assert.equal(fs.realpathSync(link), path.dirname(install));
	assert.ok(fs.existsSync(path.join(link, "SKILL.md")));

	const { dir, head } = scratchRepo();
	const out = execFileSync(path.join(link, "scripts", "write-evidence"), implementPass(dir), { encoding: "utf8" }).trim();
	assert.equal(readWritten(out).source.commit, head);
});

test("install.sh refuses to replace a real directory", () => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
	fs.mkdirSync(path.join(home, ".claude", "skills", "build-from-handoff"), { recursive: true });
	const install = fileURLToPath(new URL("../../skills/build-from-handoff/install.sh", import.meta.url));
	const r = spawnSync(install, { env: { ...process.env, HOME: home }, encoding: "utf8" });
	assert.equal(r.status, 1);
	assert.match(r.stderr, /exists and is not a symlink/);
});
