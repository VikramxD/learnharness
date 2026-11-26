import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, constants, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { PluginLearningData } from "learnharness-plugin-api";
import { ArxivClient, SpacedQueue } from "../src/arxiv.ts";
import { parseOwnWorkName } from "../src/material.ts";
import { createHarness } from "../src/service.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

const atom = await readFile(path.join(pluginRoot, "tests/fixtures/arxiv-ids.atom"), "utf8");
const PDF = new TextEncoder().encode("%PDF-1.5 fake");

type Route = (url: URL) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Route>) {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL) => {
    const url = new URL(String(input));
    requests.push(url.href);
    const route = Object.entries(routes).find(([prefix]) => url.href.startsWith(prefix))?.[1];
    if (!route) throw new Error(`offline: ${url.href}`);
    return route(url);
  }) as typeof fetch;
  return { fetcher, requests };
}

async function setup(t: Parameters<typeof tempDirectory>[0], routes: Record<string, Route>) {
  const base = await tempDirectory(t, "harness-material-");
  const { fetcher, requests } = fakeFetch(routes);
  const arxiv = new ArxivClient(new SpacedQueue(0), fetcher);
  const harness = createHarness({ directory: pluginRoot, dataDirectory: path.join(base, "data"), learning: { directory: base } as PluginLearningData, notify() {}, arxiv, fetcher });
  return { base, harness, requests };
}

const arxivRoutes = {
  "https://export.arxiv.org/api/query": () => new Response(atom),
  "https://arxiv.org/pdf/": () => new Response(PDF),
};

test("adding a paper creates its entry and stores the PDF once", async t => {
  const { base, harness, requests } = await setup(t, arxivRoutes);
  const added = await harness.operations.addPaper({ arxivId: "2407.01392v4", lineage: "Video generation" });
  assert.deepEqual(added, { entryId: "paper.2407.01392", pdfPath: path.join(base, "data/papers/2407.01392/paper.pdf") });
  assert.deepEqual(new Uint8Array(await readFile(added.pdfPath)), PDF);
  const again = await harness.operations.addPaper({ arxivId: "2407.01392" });
  assert.equal(again.pdfPath, added.pdfPath);
  assert.equal(requests.filter(r => r.startsWith("https://arxiv.org/pdf/")).length, 1, "the PDF downloads once");
  const row = (await harness.operations.snapshot()).entries.find(r => r.entry.id === "paper.2407.01392")!;
  assert.equal(row.entry.title, "Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion");
  assert.equal(row.entry.lineage, "Video generation");
});

test("adding a seeded paper keeps the seeded entry and only fetches its PDF", async t => {
  const { harness, requests } = await setup(t, arxivRoutes);
  await harness.operations.seed();
  const before = (await harness.store.read()).seq;
  await harness.operations.addPaper({ arxivId: "2006.11239" });
  assert.equal((await harness.store.read()).seq, before, "no new event for an existing entry");
  assert.equal(requests.some(r => r.includes("export.arxiv.org")), false, "the seeded title is reused");
});

test("search marks results already in the ledger, and an id searches by id", async t => {
  const { harness, requests } = await setup(t, arxivRoutes);
  await harness.operations.seed();
  const results = await harness.operations.search({ query: "2407.01392" });
  assert.match(requests[0]!, /id_list=2407\.01392/);
  assert.deepEqual(results.map(r => [r.id, r.inLedger]).sort(), [["2006.11239", true], ["2407.01392", true]]);
  await harness.operations.search({ query: "diffusion forcing" });
  assert.match(decodeURIComponent(requests[1]!.replace(/\+/g, " ")), /search_query=all:diffusion AND all:forcing/);
});

test("alphaXiv failures are soft and Semantic Scholar 429s back off", async t => {
  let s2Calls = 0;
  const { harness } = await setup(t, {
    "https://api.alphaxiv.org/": () => { throw new Error("getaddrinfo ENOTFOUND api.alphaxiv.org"); },
    "https://api.semanticscholar.org/": () => ++s2Calls < 3
      ? new Response("slow down", { status: 429, headers: { "retry-after": "0.01" } })
      : Response.json({ data: [{ citedPaper: { title: "Rolling Diffusion Models", year: 2024, externalIds: { ArXiv: "2402.09470" } } }] }),
  });
  const details = await harness.operations.paperDetails({ arxivId: "2407.01392" });
  assert.equal(details.alphaxiv.available, false);
  assert.match(!details.alphaxiv.available ? details.alphaxiv.reason : "", /unreachable/);
  assert.deepEqual(details.references, { ok: true, list: [{ title: "Rolling Diffusion Models", year: 2024, arxivId: "2402.09470" }] });
  assert.equal(s2Calls, 3);
});

test("adding a framework makes a shallow read-only checkout of the exact commit", async t => {
  const { base, harness } = await setup(t, {});
  const repo = path.join(base, "mini-sglang");
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "uploadpack.allowAnySHA1InWant", "true");
  await writeFile(path.join(repo, "radix.py"), "first\n");
  git("add", "."); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-m", "one");
  const pinned = git("rev-parse", "HEAD");
  await writeFile(path.join(repo, "radix.py"), "second\n");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "--quiet", "-am", "two");

  const added = await harness.operations.addFramework({ repoUrl: `file://${repo}`, commit: pinned });
  assert.equal(added.entryId, "framework.mini-sglang");
  assert.equal(added.checkoutPath, path.join(base, "data/frameworks", `mini-sglang@${pinned.slice(0, 7)}`));
  assert.equal(await readFile(path.join(added.checkoutPath, "radix.py"), "utf8"), "first\n");
  await assert.rejects(access(path.join(added.checkoutPath, "radix.py"), constants.W_OK), "the checkout is read-only");
  assert.equal(((await stat(added.checkoutPath)).mode & 0o222), 0);

  const byBranch = await harness.operations.addFramework({ repoUrl: `file://${repo}`, commit: "HEAD", name: "mini-sglang-head" });
  assert.notEqual(byBranch.commit, pinned, "a ref resolves to its current commit");
  await assert.rejects(harness.operations.addFramework({ repoUrl: `file://${repo}`, commit: byBranch.commit }), /already pinned/);
  execFileSync("chmod", ["-R", "u+w", path.join(base, "data/frameworks")]);
});

test("own work comes from Decision, Experiment and Architecture notes", async t => {
  const { base, harness } = await setup(t, {});
  const vault = path.join(base, "vault");
  for (const name of ["Auteur - Decision - Provider asset gates.md", "Auteur - Architecture.md", "Fictora - Experiment - Beat timing.md", "Auteur - Current Focus.md", "LearnHarness/LearnHarness - Decision - Mirror.md"]) {
    await mkdir(path.dirname(path.join(vault, name)), { recursive: true });
    await writeFile(path.join(vault, name), "# note\n");
  }
  await harness.operations.saveSettings({ vaultPath: vault });
  const notes = await harness.operations.ownWork();
  assert.deepEqual(notes.map(n => n.entryId), ["own.auteur.architecture", "own.auteur.provider-asset-gates", "own.fictora.beat-timing"]);
  await harness.operations.addOwnWork({ path: "Auteur - Decision - Provider asset gates.md" });
  const row = (await harness.operations.snapshot()).entries[0]!;
  assert.deepEqual(row.entry.source, { kind: "own", vaultNotePath: path.join(vault, "Auteur - Decision - Provider asset gates.md") });
  assert.equal(parseOwnWorkName("Auteur - Hub.md"), undefined);
});
