import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { PluginLearningData } from "learnharness-plugin-api";
import { parseAtom, SpacedQueue } from "../src/arxiv.ts";
import { createHarness } from "../src/service.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

test("Seed creates every roadmap entry once, in lineage order, with SGLang's sub-entries", async t => {
  const base = await tempDirectory(t, "harness-seed-");
  const harness = createHarness({ directory: pluginRoot, dataDirectory: base, learning: { directory: base } as PluginLearningData, notify() {} });
  const first = await harness.operations.seed();
  assert.equal(first.created, 48 + 8);
  assert.deepEqual(await harness.operations.seed(), { created: 0 });

  const { entries } = await harness.operations.snapshot();
  const ids = entries.map(r => r.entry.id as string);
  for (const id of ["paper.2006.11239", "paper.2010.02502", "paper.2206.00364", "paper.2210.02747", "paper.2407.01392", "paper.2405.12399", "paper.2408.14837", "paper.2402.15391", "paper.1707.06347", "paper.2305.18290", "paper.2402.03300", "paper.2305.13301", "paper.2311.12908", "paper.2505.05470"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(ids.indexOf("paper.2006.11239") < ids.indexOf("paper.2206.00364"), "DDPM precedes EDM");
  const frameworks = entries.filter(r => r.entry.kind === "framework").map(r => r.entry.id);
  assert.deepEqual(frameworks, ["framework.pytorch", "framework.mojo", "framework.triton", "framework.sglang", "framework.sglang.radix-cache", "framework.sglang.scheduler", "framework.sglang.rmsnorm-mojo-kernel", "framework.max"]);
  assert.equal(entries.find(r => r.entry.id === "framework.sglang.scheduler")?.entry.parentId, "framework.sglang");
});

test("arXiv Atom parses ids without versions and skips unknown ids", async () => {
  const papers = parseAtom(await readFile(path.join(pluginRoot, "tests/fixtures/arxiv-ids.atom"), "utf8"));
  assert.deepEqual(papers.map(p => p.id).sort(), ["2006.11239", "2407.01392"]);
  const forcing = papers.find(p => p.id === "2407.01392")!;
  assert.equal(forcing.title, "Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion");
  assert.ok(forcing.authors.includes("Vincent Sitzmann"));
  assert.ok(forcing.categories.includes("cs.LG"));
});

test("the arXiv queue starts requests at least 3 seconds apart, even when one fails", async () => {
  let now = 0;
  const starts: number[] = [];
  const queue = new SpacedQueue(3000, { now: () => now, sleep: async ms => { now += ms; } });
  await Promise.all([
    queue.run(async () => { starts.push(now); }),
    queue.run(async () => { starts.push(now); throw new Error("boom"); }).catch(() => undefined),
    queue.run(async () => { starts.push(now); }),
  ]);
  assert.deepEqual(starts, [0, 3000, 6000]);
});
