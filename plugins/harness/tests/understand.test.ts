import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { ChatListItem, ChatRecord, GraphChain, GraphSnapshot, PluginLearningData } from "learnharness-plugin-api";
import { createHarness } from "../src/service.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

interface FakeSession { id: string; title: string; text: string; updatedAt?: string }

function fakeLearning(directory: string, sessions: FakeSession[], chains: GraphChain[]) {
  const reads: string[] = [];
  const learning = {
    directory,
    listSessions: () => sessions.map(s => ({ id: s.id, title: s.title, kind: "teach", updatedAt: s.updatedAt ?? "2026-11-26T00:00:00Z", createdAt: "2026-11-26T00:00:00Z" }) as ChatListItem),
    getSession: (id: string) => {
      reads.push(id);
      const s = sessions.find(x => x.id === id);
      return s ? ({ id, title: s.title, messages: [{ role: "user", content: s.text }] } as unknown as ChatRecord) : null;
    },
    graph: () => ({ chains, propositions: [], sessions: {}, nodeSessions: {} }) as unknown as GraphSnapshot,
  } as unknown as PluginLearningData;
  return { learning, reads };
}

const chain = (id: string, chatId: string): GraphChain => ({ id, premises: ["n_1"], conclusion: "n_2", provenance: [{ chatId, messageId: "m1" }], createdAt: "2026-11-26T00:00:00Z" });

async function setup(t: Parameters<typeof tempDirectory>[0], sessions: FakeSession[], chains: GraphChain[]) {
  const base = await tempDirectory(t, "harness-understand-");
  const { learning, reads } = fakeLearning(base, sessions, chains);
  const harness = createHarness({ directory: pluginRoot, dataDirectory: path.join(base, "data"), learning, notify() {} });
  await harness.operations.seed();
  return { base, harness, reads };
}

test("sessions that mention the entry id, arXiv id or PDF path are suggested; linking moves Understand to linked", async t => {
  const { base, harness, reads } = await setup(t, [
    { id: "c-id", title: "Diffusion Forcing", text: "Teach me paper.2407.01392 please" },
    { id: "c-arxiv", title: "From arXiv", text: "read arXiv 2407.01392" },
    { id: "c-pdf", title: "From path", text: "" },
    { id: "c-other", title: "Unrelated", text: "Teach me PPO" },
  ], []);
  const pdf = path.join(base, "data/papers/2407.01392/paper.pdf");
  await mkdir(path.dirname(pdf), { recursive: true });
  await writeFile(pdf, "%PDF-");
  const view = await harness.operations.entrySessions({ entryId: "paper.2407.01392" });
  assert.deepEqual(view.suggested.map(s => [s.id, s.mentions]), [["c-id", ["paper.2407.01392", "2407.01392"]], ["c-arxiv", ["2407.01392"]]]);
  assert.equal(view.canMarkUnderstood, false);

  await harness.operations.entrySessions({ entryId: "paper.2407.01392" });
  assert.equal(reads.filter(id => id === "c-id").length, 1, "unchanged transcripts are read once");

  await harness.operations.linkSession({ entryId: "paper.2407.01392", chatId: "c-id" });
  const row = (await harness.operations.snapshot()).entries.find(r => r.entry.id === "paper.2407.01392")!;
  assert.deepEqual(row.stages.understand, { state: "linked", chatIds: ["c-id"] });
  const after = await harness.operations.entrySessions({ entryId: "paper.2407.01392" });
  assert.deepEqual(after.linked.map(s => s.id), ["c-id"]);
  assert.deepEqual(after.suggested.map(s => s.id), ["c-arxiv"], "a linked session is no longer suggested");
});

test("Mark understood needs chains from a linked session and records them", async t => {
  const { harness } = await setup(t, [{ id: "c1", title: "DDPM", text: "" }, { id: "c2", title: "Other", text: "" }], [chain("arg_a", "c1"), chain("arg_b", "c2"), chain("arg_c", "c1")]);
  await harness.operations.linkSession({ entryId: "paper.2006.11239", chatId: "c2" });
  await harness.operations.unlinkSession({ entryId: "paper.2006.11239", chatId: "c2" });
  await assert.rejects(harness.operations.markUnderstood({ entryId: "paper.2006.11239" }), /at least one reasoning chain/);

  await harness.operations.linkSession({ entryId: "paper.2006.11239", chatId: "c1" });
  const view = await harness.operations.entrySessions({ entryId: "paper.2006.11239" });
  assert.equal(view.canMarkUnderstood, true);
  assert.deepEqual(view.linked, [{ id: "c1", title: "DDPM", kind: "teach", updatedAt: "2026-11-26T00:00:00Z", chains: 2 }]);
  await harness.operations.markUnderstood({ entryId: "paper.2006.11239" });
  const understand = (await harness.operations.snapshot()).entries.find(r => r.entry.id === "paper.2006.11239")!.stages.understand;
  assert.equal(understand.state, "done");
  assert.deepEqual(understand.state === "done" && understand.chainIds, ["arg_a", "arg_c"]);
});

test("the teaching goal names local paths, understood prerequisites and the central question", async t => {
  const { base, harness } = await setup(t, [{ id: "c1", title: "DDPM", text: "" }], [chain("arg_a", "c1")]);
  await harness.operations.linkSession({ entryId: "paper.2006.11239", chatId: "c1" });
  await harness.operations.markUnderstood({ entryId: "paper.2006.11239" });
  const pdf = path.join(base, "data/papers/2206.00364/paper.pdf");
  await mkdir(path.dirname(pdf), { recursive: true });
  await writeFile(pdf, "%PDF-");
  const { text } = await harness.operations.teachingGoal({ entryId: "paper.2206.00364" });
  assert.equal(text, [
    "Teach me Elucidating the Design Space of Diffusion-Based Generative Models (paper.2206.00364) until it feels obviously true, down to its derivations or design.",
    `The paper is on disk at ${pdf} (arXiv 2206.00364). Read it from there.`,
    "Already understood in this lineage: Denoising Diffusion Probabilistic Models (paper.2006.11239). Build on them.",
    "Central question: Why does EDM's preconditioning take its form, starting from DDPM, and which design choices are independent?",
  ].join("\n"));
});

test("a reopened entry's goal targets the gap's concept", async t => {
  const { base, harness } = await setup(t, [], []);
  const root = path.join(base, "repo");
  const directory = path.join(root, "evidence/framework.sglang.radix-cache/serve");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "20270203T091200Z.json"), JSON.stringify({
    schema: "lh-evidence/1", entry: "framework.sglang.radix-cache", stage: "serve", outcome: "fail", producedAt: "2027-02-03T09:12:00Z",
    source: { repo: root, commit: "c09b7d2" }, command: "bench", endpoint: "http://x", hardware: "L4", p50Ms: 412, p95Ms: 1880,
    throughput: { value: 9.4, unit: "requests/s" }, costPer1k: { usd: 0.21 },
    gap: { concept: "radix cache eviction", why: "Evicted shared prefixes in LRU order without reference counts." },
  }));
  await harness.operations.saveSettings({ evidenceRoots: [root] });
  await harness.rescan();
  const { text } = await harness.operations.teachingGoal({ entryId: "framework.sglang.radix-cache" });
  assert.match(text, /^Teach me radix cache eviction, as it applies to SGLang radix cache \(framework\.sglang\.radix-cache\)\.\nMy serve attempt failed because of it: Evicted shared prefixes/);
  assert.match(text, /Central question: what about radix cache eviction did I get wrong/);
});
