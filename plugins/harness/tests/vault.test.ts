import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { ChatListItem, GraphChain, GraphNode, GraphSnapshot, PluginLearningData } from "learnharness-plugin-api";
import { createHarness } from "../src/service.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

const node = (id: string, name: string, statement: string): GraphNode => ({ id, name, statement, aliases: [], createdAt: "", provenance: [] });
const chain = (id: string, premises: string[], conclusion: string, chatId: string): GraphChain => ({ id, premises, conclusion, provenance: [{ chatId, messageId: "m" }], createdAt: "" });

async function setup(t: Parameters<typeof tempDirectory>[0]) {
  const base = await tempDirectory(t, "harness-vault-");
  const vault = path.join(base, "vault");
  await mkdir(vault);
  await writeFile(path.join(vault, "Auteur - Architecture.md"), "# mine\n");
  const graph = {
    propositions: [
      node("n_q", "Forward closed form", "x_t can be sampled from x_0 in one step through alpha-bar."),
      node("n_g", "Gaussian composition", "A composition of Gaussian steps is Gaussian."),
      node("n_l", "Noise prediction loss", "Predicting the added noise minimizes a reweighted ELBO."),
    ],
    chains: [chain("arg_closedform1", ["n_g"], "n_q", "c1"), chain("arg_loss12345", ["n_q"], "n_l", "c1"), chain("arg_other", ["n_g"], "n_l", "c-unlinked")],
    sessions: { c1: "DDPM session" },
    nodeSessions: {},
  } as unknown as GraphSnapshot;
  const learning = {
    directory: base,
    listSessions: () => [{ id: "c1", title: "DDPM session", kind: "teach", updatedAt: "x" } as ChatListItem],
    getSession: () => null,
    graph: () => graph,
  } as unknown as PluginLearningData;
  const harness = createHarness({ directory: pluginRoot, dataDirectory: path.join(base, "data"), learning, notify() {}, now: () => new Date(2026, 10, 26, 12) });
  await harness.operations.seed();
  await harness.operations.saveSettings({ vaultPath: vault });
  await harness.operations.linkSession({ entryId: "paper.2006.11239", chatId: "c1" });
  await harness.operations.markUnderstood({ entryId: "paper.2006.11239" });
  return { base, vault, harness };
}

async function listTree(directory: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) out.push(...await listTree(path.join(directory, item.name), relative));
    else out.push(relative);
  }
  return out.sort();
}

const DDPM_NOTE = "LearnHarness/Entries/LearnHarness - Entry - Denoising Diffusion Probabilistic Models.md";
const CHAIN_NOTE = "LearnHarness/Chains/LearnHarness - Chain - Noise prediction loss loss1234.md";

test("the mirror writes an index, one note per entry and one per linked chain, only under LearnHarness/", async t => {
  const { vault, harness } = await setup(t);
  const report = await harness.operations.syncVault();
  assert.equal(report.written.length, 1 + 56 + 2);
  const files = await listTree(vault);
  assert.ok(files.every(f => f === "Auteur - Architecture.md" || f.startsWith("LearnHarness/")), "nothing outside LearnHarness/");
  assert.equal(await readFile(path.join(vault, "Auteur - Architecture.md"), "utf8"), "# mine\n");
  assert.ok(files.includes("LearnHarness/LearnHarness - Index.md"));
  assert.equal(files.filter(f => f.startsWith("LearnHarness/Chains/")).length, 2, "the unlinked session's chain is not mirrored");

  const entry = await readFile(path.join(vault, DDPM_NOTE), "utf8");
  assert.match(entry, /^---\ntitle: LearnHarness - Entry - Denoising Diffusion Probabilistic Models\ntags: \[learnharness, entry, paper\]\nproject: LearnHarness\nstatus: current\nlh_entry: paper\.2006\.11239\nlh_understand: done\n/);
  assert.match(entry, /\[\[LearnHarness - Chain - Noise prediction loss loss1234\]\]/);

  const chainNote = await readFile(path.join(vault, CHAIN_NOTE), "utf8");
  assert.match(chainNote, /lh_entry: \[paper\.2006\.11239\]/);
  assert.match(chainNote, /## Premises\n\n- x_t can be sampled from x_0 in one step through alpha-bar\. \(\[\[LearnHarness - Chain - Forward closed form closedfo\]\]\)/);
  assert.match(chainNote, /## Therefore\n\nPredicting the added noise minimizes a reweighted ELBO\./);
  assert.match(chainNote, /\[\[LearnHarness - Entry - Denoising Diffusion Probabilistic Models\]\]/);
});

test("a re-sync rewrites only changed notes and a hand edit survives", async t => {
  const { vault, harness } = await setup(t);
  await harness.operations.syncVault();
  const edited = path.join(vault, CHAIN_NOTE);
  await writeFile(edited, (await readFile(edited, "utf8")) + "\nMy own aside.\n");
  const unchanged = await harness.operations.syncVault();
  assert.deepEqual(unchanged.written, []);
  assert.deepEqual(unchanged.kept, [{ path: CHAIN_NOTE, reason: "edited since Harness wrote it" }]);
  assert.match(await readFile(edited, "utf8"), /My own aside\./);

  await harness.operations.linkSession({ entryId: "paper.2010.02502", chatId: "c1" });
  const after = await harness.operations.syncVault();
  assert.deepEqual(after.written.sort(), [
    "LearnHarness/Chains/LearnHarness - Chain - Forward closed form closedfo.md",
    "LearnHarness/Entries/LearnHarness - Entry - Denoising Diffusion Implicit Models.md",
    "LearnHarness/LearnHarness - Index.md",
  ], "only notes whose content changed are rewritten; the edited chain note is skipped");
  assert.match(await readFile(edited, "utf8"), /My own aside\./, "the edit survives a sync that changes the chain's content");
});

test("the mirror deletes only notes it created and no longer needs, and never a file it did not create", async t => {
  const { vault, harness } = await setup(t);
  const squatter = path.join(vault, "LearnHarness/Entries/LearnHarness - Entry - Attention Is All You Need.md");
  await mkdir(path.dirname(squatter), { recursive: true });
  await writeFile(squatter, "hand written\n");
  const first = await harness.operations.syncVault();
  assert.ok(first.kept.some(k => k.path.endsWith("Attention Is All You Need.md") && k.reason === "not created by Harness"));
  assert.equal(await readFile(squatter, "utf8"), "hand written\n");

  await harness.operations.unlinkSession({ entryId: "paper.2006.11239", chatId: "c1" });
  const second = await harness.operations.syncVault();
  assert.deepEqual(second.deleted.sort(), ["LearnHarness/Chains/LearnHarness - Chain - Forward closed form closedfo.md", CHAIN_NOTE]);
  assert.equal(await readFile(squatter, "utf8"), "hand written\n");
});

test("Hand off to build writes the Build skill's Handoff shape and records it on the entry", async t => {
  const { vault, harness } = await setup(t);
  await harness.operations.syncVault();
  await assert.rejects(harness.operations.handOff({ entryId: "paper.2006.11239", stage: "implement" }), /needs the reference/);
  const { notePath } = await harness.operations.handOff({
    entryId: "paper.2006.11239", stage: "implement", topic: "DDPM noise schedule",
    reference: "diffusers DDPMScheduler 0.36, linear beta schedule", repo: "/Users/me/ddpm", command: "uv run pytest",
  });
  assert.equal(notePath, path.join(vault, "LearnHarness/Handoffs/LearnHarness - Handoff - 2026-11-26 - DDPM noise schedule.md"));
  const note = await readFile(notePath, "utf8");
  assert.equal(note.split("---\n")[1], [
    "title: LearnHarness - Handoff - 2026-11-26 - DDPM noise schedule",
    "tags: [learnharness, handoff]",
    "project: LearnHarness",
    "status: open",
    "entry: paper.2006.11239",
    "stage: implement",
    "reference: diffusers DDPMScheduler 0.36, linear beta schedule",
    "repo: /Users/me/ddpm",
    "command: uv run pytest",
    "lh_entry: paper.2006.11239",
    "",
  ].join("\n"));
  assert.match(note, /## What was understood\n\n- \[\[LearnHarness - Chain - Forward closed form closedfo\]\]\n- \[\[LearnHarness - Chain - Noise prediction loss loss1234\]\]/);
  assert.match(note, /`\/Users\/me\/ddpm\/evidence\/paper\.2006\.11239\/implement\/<producedAt as YYYYMMDDTHHMMSSZ>\.json`/);
  assert.match(note, /`tests` as `\{ passed, total \}`/);

  const row = (await harness.operations.snapshot()).entries.find(r => r.entry.id === "paper.2006.11239")!;
  assert.deepEqual(row.handoffs, [notePath]);
  const sync = await harness.operations.syncVault();
  assert.deepEqual(sync.deleted, [], "a mirror sync never deletes a Handoff");
  assert.match(await readFile(path.join(vault, DDPM_NOTE), "utf8"), /## Handoffs\n\n- \[\[LearnHarness - Handoff - 2026-11-26 - DDPM noise schedule\]\]/);

  await writeFile(notePath, note + "\nedited\n");
  await assert.rejects(harness.operations.handOff({ entryId: "paper.2006.11239", stage: "implement", topic: "DDPM noise schedule", reference: "x" }), /was edited/);
});

test("the mirror refuses a vault that does not exist", async t => {
  const { base, harness } = await setup(t);
  await harness.operations.saveSettings({ vaultPath: path.join(base, "missing") });
  await assert.rejects(harness.operations.syncVault(), /does not exist/);
});
