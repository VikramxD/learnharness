import { readFileSync } from "node:fs";
import { ArxivClient } from "../src/arxiv.ts";
import type { Roadmap } from "../src/seed.ts";

const roadmap = JSON.parse(readFileSync(new URL("../seed/roadmap.json", import.meta.url), "utf8")) as Roadmap;
const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const expected = roadmap.lineages.flatMap(lineage => lineage.papers);
const arxiv = new ArxivClient();
let failures = 0;

for (let i = 0; i < expected.length; i += 10) {
  const batch = expected.slice(i, i + 10);
  const found = new Map((await arxiv.byIds(batch.map(p => p.arxivId))).map(p => [p.id, p.title]));
  for (const paper of batch) {
    const title = found.get(paper.arxivId);
    const ok = title !== undefined && normalize(title) === normalize(paper.title);
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${paper.arxivId}  ${title ?? "(not found)"}${ok ? "" : `  expected: ${paper.title}`}`);
  }
}

for (const framework of roadmap.frameworks) {
  const [, owner, repo] = /github\.com\/([^/]+)\/([^/.]+)/.exec(framework.repoUrl) ?? [];
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${framework.commit}`, { headers: { "user-agent": "LearnHarness-Harness/0.1" } });
  const ok = response.ok;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${framework.id}  ${owner}/${repo}@${framework.commit.slice(0, 12)}  (${response.status})`);
}

console.log(failures ? `${failures} mismatches` : `all ${expected.length} papers and ${roadmap.frameworks.length} framework commits verified`);
process.exitCode = failures ? 1 : 0;
