import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { PluginLearningData } from "learnharness-plugin-api";
import { evidenceFileName } from "../../../contracts/evidence/validate.mjs";
import { createEntries, parseEntryId, stagesOf, type Entry } from "../src/domain.ts";
import { createHarness } from "../src/service.ts";
import { repoRoot, tempDirectory } from "./helpers.ts";

const example = async (name: string) => JSON.parse(await readFile(path.join(repoRoot, "contracts/evidence/examples", name), "utf8"));

async function place(root: string, evidence: { entry: string; stage: string; producedAt: string }, body: unknown = evidence) {
  const directory = path.join(root, evidence.entry, evidence.stage);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, evidenceFileName(evidence.producedAt));
  await writeFile(file, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  return file;
}

async function setup(t: Parameters<typeof tempDirectory>[0]) {
  const base = await tempDirectory(t, "harness-evidence-");
  const learning = { directory: path.join(base, "learning") } as PluginLearningData;
  const notified: string[] = [];
  const harness = createHarness({ dataDirectory: path.join(base, "data"), learning, notify: topic => notified.push(topic) });
  const repo = path.join(base, "repo");
  const runDesk = path.join(learning.directory, "plugins", "run-desk", "data", "evidence");
  await harness.operations.saveSettings({ evidenceRoots: [repo, runDesk] });
  return { base, harness, repo, runDesk, notified };
}

const radix: Entry = { id: parseEntryId("framework.sglang.radix-cache")!, kind: "framework", title: "Radix cache", parentId: parseEntryId("framework.sglang")!, source: { kind: "framework", repoUrl: "https://github.com/sgl-project/sglang", commit: "c0ffee" } };

test("the default evidence roots include Run Desk's evidence folder", async t => {
  const base = await tempDirectory(t, "harness-defaults-");
  const harness = createHarness({ dataDirectory: path.join(base, "data"), learning: { directory: "/learning" } as PluginLearningData, notify() {} });
  assert.deepEqual((await harness.operations.getSettings()).evidenceRoots, ["/learning/plugins/run-desk/data/evidence"]);
});

test("a scan ingests repo and Run Desk evidence, moves stages, and a rescan is a no-op", async t => {
  const { harness, repo, runDesk, notified } = await setup(t);
  await harness.store.transact(s => createEntries(s, [radix]));
  const implement = await example("implement-pass.json");
  await place(path.join(repo, "evidence"), implement);
  const serve = await example("serve-fail-gap.json");
  await place(runDesk, serve);

  const report = await harness.rescan();
  assert.deepEqual({ accepted: report.accepted, rejected: report.rejected }, { accepted: 2, rejected: 0 });
  assert.deepEqual(report.roots.map(r => [r.directory, r.files]), [[path.join(repo, "evidence"), 1], [runDesk, 1]]);
  assert.deepEqual(notified, ["ledger"]);

  const snapshot = await harness.operations.snapshot();
  const row = snapshot.entries.find(r => r.entry.id === radix.id)!;
  assert.equal(row.stages.serve.state, "failed");
  assert.equal(row.stages.understand.state, "reopened");
  assert.deepEqual(snapshot.orphans.map(o => o.entryId), ["paper.2006.11239"], "evidence for an entry not yet in the ledger is kept");

  const again = await harness.rescan();
  assert.deepEqual({ accepted: again.accepted, rejected: again.rejected }, { accepted: 0, rejected: 0 });
  assert.deepEqual(notified, ["ledger"], "a no-op rescan notifies nobody");
});

test("invalid files surface with every error, and fixing the file in place accepts it", async t => {
  const { harness, repo } = await setup(t);
  const optimize = { ...(await example("optimize-pass.json")), result: 50 };
  const file = await place(path.join(repo, "evidence"), optimize);
  await place(path.join(repo, "evidence"), { entry: "paper.2006.11239", stage: "implement", producedAt: "2026-12-01T00:00:00Z" }, "{ not json");
  await harness.rescan();
  let rejected = (await harness.operations.snapshot()).rejected;
  assert.equal(rejected.length, 2);
  assert.deepEqual(rejected.find(r => r.file === file)?.errors, ["optimize passes only when result beats baseline."]);
  assert.match(rejected.find(r => r.file !== file)!.errors[0]!, /^not valid JSON/);

  await writeFile(file, JSON.stringify({ ...optimize, result: 33.5 }));
  await harness.rescan();
  rejected = (await harness.operations.snapshot()).rejected;
  assert.equal(rejected.some(r => r.file === file), false);
  const state = await harness.store.read();
  assert.equal(stagesOf(state, parseEntryId("framework.sglang.rmsnorm-kernel")!).optimize.state, "done");
});

test("a missing root is reported, not fatal", async t => {
  const { harness, repo, runDesk } = await setup(t);
  const report = await harness.rescan();
  assert.deepEqual(report.roots.map(r => [r.root, r.found]), [[repo, false], [runDesk, false]]);
});

test("settings refuse relative evidence roots", async t => {
  const { harness } = await setup(t);
  await assert.rejects(harness.operations.saveSettings({ evidenceRoots: ["relative/path"] }), /absolute path/);
});
