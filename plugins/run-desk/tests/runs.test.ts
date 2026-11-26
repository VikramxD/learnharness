import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { validateEvidence } from "../src/contract.ts";
import { modalCli } from "../src/modal.ts";
import type { Run } from "../src/model.ts";
import { createRunDesk, type RunDeskDeps } from "../src/runs.ts";
import { installFakeModal, optimizeLine, scriptRepo, tempDirectory, template, until } from "./helpers.ts";

async function setup(t: Parameters<typeof tempDirectory>[0], body: string, extra: Partial<RunDeskDeps> = {}) {
  t.after(() => delay(600));
  const directory = await tempDirectory(t);
  const fake = installFakeModal(directory);
  const repo = scriptRepo(directory, body);
  const dataDirectory = path.join(directory, "data");
  const deps: RunDeskDeps = { dataDirectory, cli: async () => ({ program: fake.program, cli: modalCli(fake.program) }), ...extra };
  return { ...repo, fake, dataDirectory, deps, desk: createRunDesk(deps) };
}

const confirm = { gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 30 };
const finished = (run: Run) => ["succeeded", "failed", "stopped"].includes(run.status);

test("a launched run goes queued, running, succeeded and writes a valid evidence file", async t => {
  const { desk, script, commit, fake, dataDirectory } = await setup(t, `import time\ntime.sleep(0.5)\n${optimizeLine()}\n`);
  const running = await desk.launch(template(script), confirm);
  assert.equal(running.status, "running");
  assert.match(running.appId!, /^ap-[A-Za-z0-9]{22}$/);
  const runCall = fake.calls().find(call => call[0] === "run")!;
  assert.deepEqual(runCall.slice(0, 4), ["run", "--detach", "--name", running.appName]);
  assert.deepEqual(runCall.slice(4), [script, "--shape", "4096x8192"]);

  const done = await until(async () => { await desk.poll(); return desk.get(running.id); }, finished);
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(done.outcome, "pass");
  assert.equal(done.evidenceFile, path.join("evidence", "framework.sglang.rmsnorm-kernel", "optimize", `${done.finishedAt!.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "")}.json`));
  const evidence = JSON.parse(await readFile(path.join(dataDirectory, done.evidenceFile!), "utf8"));
  assert.equal(validateEvidence(evidence).ok, true);
  assert.deepEqual(evidence.source, { repo: realpathSync(path.dirname(script)), commit });
  assert.equal(evidence.command, `${fake.program} run --detach --name ${running.appName} ${script} --shape 4096x8192`);
  assert.equal(evidence.producedAt, done.finishedAt!);
  assert.equal(evidence.result, 33.5);
});

test("a restarted desk re-polls a run it did not launch and still finishes it", async t => {
  const { deps, desk, script } = await setup(t, `import time\ntime.sleep(1.5)\n${optimizeLine()}\n`);
  const running = await desk.launch(template(script), confirm);
  const afterRestart = createRunDesk(deps);
  await afterRestart.poll();
  assert.equal((await afterRestart.get(running.id)).status, "running", "still running before the script ends");
  const done = await until(async () => { await afterRestart.poll(); return afterRestart.get(running.id); }, finished);
  assert.equal(done.status, "succeeded", done.error);
});

test("a queued run lost before its app id was saved is recovered by its app name", async t => {
  const { deps, desk, script } = await setup(t, `${optimizeLine()}\n`);
  const launched = await desk.launch(template(script), confirm);
  const runsFile = path.join(deps.dataDirectory, "runs.json");
  const state = JSON.parse(await readFile(runsFile, "utf8"));
  const { appId, startedAt, ...queued } = state.runs[0];
  await writeFile(runsFile, JSON.stringify({ version: 1, runs: [{ ...queued, status: "queued" }] }));
  const restarted = createRunDesk(deps);
  const done = await until(async () => { await restarted.poll(); return restarted.get(launched.id); }, finished);
  assert.equal(done.appId, launched.appId);
  assert.equal(done.status, "succeeded", done.error);
});

test("a run with no evidence line fails, writes no file and records why", async t => {
  const { desk, script } = await setup(t, `print("training done")\n`);
  const running = await desk.launch(template(script), confirm);
  const done = await until(async () => { await desk.poll(); return desk.get(running.id); }, finished);
  assert.equal(done.status, "failed");
  assert.equal(done.evidenceFile, undefined);
  assert.match(done.error!, /printed no LH_EVIDENCE line/);
});

test("a pass claim that breaks the contract is kept as a fail evidence", async t => {
  const { desk, script, dataDirectory } = await setup(t, `${optimizeLine({ result: 50 })}\n`);
  const running = await desk.launch(template(script), confirm);
  const done = await until(async () => { await desk.poll(); return desk.get(running.id); }, finished);
  assert.equal(done.status, "failed");
  assert.equal(done.outcome, "fail");
  assert.match(done.error!, /optimize passes only when result beats baseline/);
  const evidence = JSON.parse(await readFile(path.join(dataDirectory, done.evidenceFile!), "utf8"));
  assert.equal(evidence.outcome, "fail");
  assert.equal(validateEvidence(evidence).ok, true);
});

test("stop ends a running run on Modal and marks it stopped", async t => {
  const { desk, script, fake } = await setup(t, `import time\ntime.sleep(30)\n`);
  const running = await desk.launch(template(script), confirm);
  const stopped = await desk.stop(running.id);
  assert.equal(stopped.status, "stopped");
  assert.ok(fake.calls().some(call => call.join(" ") === `app stop --yes ${running.appId}`));
  await desk.poll();
  assert.equal((await desk.get(running.id)).status, "stopped", "a later poll leaves a stopped run alone");
});

test("a run past its max runtime cap is stopped by the poller", async t => {
  let clock = Date.now();
  const { desk, script, fake } = await setup(t, `import time\ntime.sleep(30)\n`, { now: () => new Date(clock) });
  const running = await desk.launch(template(script), { ...confirm, maxRuntimeMinutes: 1 });
  clock += 61_000;
  await desk.poll();
  const run = await desk.get(running.id);
  assert.equal(run.status, "stopped");
  assert.match(run.error!, /max runtime cap of 1 min/);
  assert.ok(fake.calls().some(call => call[1] === "stop"));
});

test("launch refuses a stale confirmation or a script outside git, and never calls modal run", async t => {
  const { desk, script, fake, deps } = await setup(t, `${optimizeLine()}\n`);
  await assert.rejects(desk.launch(template(script), { ...confirm, hourlyUsd: 0.5 }), /no longer matches/);
  const loose = path.join(path.dirname(deps.dataDirectory), "loose.py");
  await writeFile(loose, "print(1)\n");
  await assert.rejects(createRunDesk({ ...deps, gitSource: async () => { throw new Error("not a git repo"); } }).launch(template(loose), confirm), /not a git repo/);
  assert.equal(fake.calls().filter(call => call[0] === "run").length, 0);
});

test("a finish interrupted after the evidence write converges on the same single evidence file", async t => {
  const { desk, deps, script, dataDirectory } = await setup(t, `${optimizeLine()}\n`);
  const running = await desk.launch(template(script), confirm);
  const done = await until(async () => { await desk.poll(); return desk.get(running.id); }, finished);
  const runsFile = path.join(deps.dataDirectory, "runs.json");
  const state = JSON.parse(await readFile(runsFile, "utf8"));
  const { evidenceFile, outcome, ...interrupted } = state.runs[0];
  await writeFile(runsFile, JSON.stringify({ version: 1, runs: [{ ...interrupted, status: "running" }] }));
  const restarted = createRunDesk({ ...deps, now: () => new Date(Date.now() + 5000) });
  await restarted.poll();
  const again = await restarted.get(running.id);
  assert.equal(again.status, "succeeded");
  assert.equal(again.evidenceFile, done.evidenceFile);
  assert.deepEqual(await readdir(path.join(dataDirectory, path.dirname(done.evidenceFile!))), [path.basename(done.evidenceFile!)]);
});
