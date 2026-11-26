import * as fs from "node:fs/promises";
import path from "node:path";
import type { GraphChain, GraphNode } from "learnharness-plugin-api";
import { BUILD_STAGES, type BuildStage, type BuildStatus, type Entry, type EntryId } from "./domain.ts";
import { evidenceSummary } from "./evidence-text.ts";
import { serialized, sha256, writeFileAtomic } from "./files.ts";
import type { EntryRow } from "./projection.ts";

export const MIRROR_FOLDER = "LearnHarness";
const PROJECT = "LearnHarness";

const yamlScalar = (value: string) => (/^([A-Za-z0-9]|\/[\w.-]|~\/)[\w .,/@+()~-]*$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) ? value : JSON.stringify(value));

function frontmatter(fields: Record<string, string | string[] | undefined>): string {
  const lines = Object.entries(fields).flatMap(([key, value]) => {
    if (value === undefined) return [];
    return [`${key}: ${Array.isArray(value) ? `[${value.map(yamlScalar).join(", ")}]` : yamlScalar(value)}`];
  });
  return `---\n${lines.join("\n")}\n---\n`;
}

const safeName = (text: string) => text.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim();
const link = (notePath: string) => `[[${path.basename(notePath, ".md")}]]`;

const buildCell = (status: BuildStatus) => (status.state === "open" ? "open" : `${status.state}: ${evidenceSummary(status.evidence.evidence)}`);

export interface MirrorInput {
  rows: EntryRow[];
  propositions: GraphNode[];
  chains: GraphChain[];
  sessionTitles: Record<string, string>;
}

export function mirrorNotes(input: MirrorInput): { notes: Map<string, string>; chainNotesOf: (id: EntryId) => string[] } {
  const notes = new Map<string, string>();
  const statements = new Map(input.propositions.map(node => [node.id, node]));
  const entryNotes = new Map<EntryId, string>();
  const usedNames = new Set<string>();
  for (const row of input.rows) {
    let name = `${PROJECT} - Entry - ${safeName(row.entry.title)}`;
    if (usedNames.has(name)) name = `${name} (${row.entry.id})`;
    usedNames.add(name);
    entryNotes.set(row.entry.id, `${MIRROR_FOLDER}/Entries/${name}.md`);
  }

  const chainEntries = new Map<string, EntryId[]>();
  for (const row of input.rows) {
    for (const chain of input.chains) {
      if (chain.provenance.some(point => row.chatIds.includes(point.chatId))) chainEntries.set(chain.id, [...(chainEntries.get(chain.id) ?? []), row.entry.id]);
    }
  }
  const mirroredChains = input.chains.filter(chain => chainEntries.has(chain.id));
  const nodeName = (id: string) => statements.get(id)?.name ?? id;
  const chainNotes = new Map<string, string>();
  const usedChainNames = new Set<string>();
  for (const chain of mirroredChains) {
    let name = `${PROJECT} - Chain - ${safeName(nodeName(chain.conclusion))} ${chain.id.slice(-8)}`;
    if (usedChainNames.has(name)) name = `${PROJECT} - Chain - ${safeName(nodeName(chain.conclusion))} ${chain.id}`;
    usedChainNames.add(name);
    chainNotes.set(chain.id, `${MIRROR_FOLDER}/Chains/${name}.md`);
  }
  const concludedBy = new Map<string, string>();
  for (const chain of mirroredChains) concludedBy.set(chain.conclusion, chainNotes.get(chain.id)!);

  for (const chain of mirroredChains) {
    const notePath = chainNotes.get(chain.id)!;
    const entries = chainEntries.get(chain.id)!;
    const proposition = (id: string) => {
      const statement = statements.get(id)?.statement ?? id;
      const source = concludedBy.get(id);
      return source && source !== notePath ? `${statement} (${link(source)})` : statement;
    };
    const sessions = [...new Set(chain.provenance.map(point => point.chatId))].map(id => input.sessionTitles[id] ?? id);
    notes.set(notePath, [
      frontmatter({ title: path.basename(notePath, ".md"), tags: ["learnharness", "chain"], project: PROJECT, status: "current", lh_entry: entries, lh_chain: chain.id }),
      `# ${nodeName(chain.conclusion)}`,
      "",
      "## Premises",
      "",
      ...chain.premises.map(id => `- ${proposition(id)}`),
      "",
      "## Therefore",
      "",
      proposition(chain.conclusion),
      "",
      "## Taught for",
      "",
      ...entries.map(id => `- ${link(entryNotes.get(id)!)}`),
      "",
      `Sessions: ${sessions.join("; ")}`,
      "",
    ].join("\n"));
  }

  for (const row of input.rows) {
    const notePath = entryNotes.get(row.entry.id)!;
    const chains = mirroredChains.filter(chain => chainEntries.get(chain.id)!.includes(row.entry.id));
    const understand = row.stages.understand;
    const understandCell = understand.state === "reopened" ? `reopened: gap in ${understand.gap.concept} (${understand.gap.stage})` : understand.state;
    notes.set(notePath, [
      frontmatter({
        title: path.basename(notePath, ".md"), tags: ["learnharness", "entry", row.entry.kind], project: PROJECT, status: "current", lh_entry: row.entry.id,
        lh_understand: understand.state, lh_implement: row.stages.implement.state, lh_optimize: row.stages.optimize.state, lh_serve: row.stages.serve.state,
      }),
      `# ${row.entry.title}`,
      "",
      `Entry \`${row.entry.id}\`${row.entry.lineage ? ` in ${row.entry.lineage}` : ""}. Source: ${sourceText(row.entry)}.`,
      "",
      "| Stage | Status |",
      "| --- | --- |",
      `| Understand | ${understandCell} |`,
      ...BUILD_STAGES.map(stage => `| ${stage[0]!.toUpperCase()}${stage.slice(1)} | ${buildCell(row.stages[stage]).replace(/\|/g, "\\|")} |`),
      "",
      "## Reasoning chains",
      "",
      ...(chains.length ? chains.map(chain => `- ${link(chainNotes.get(chain.id)!)}`) : ["None from linked sessions yet."]),
      ...(row.handoffs.length ? ["", "## Handoffs", "", ...row.handoffs.map(note => `- ${link(note)}`)] : []),
      "",
    ].join("\n"));
  }

  const groups = new Map<string, EntryRow[]>();
  for (const row of input.rows) {
    const group = row.entry.kind === "paper" ? `Papers: ${row.entry.lineage ?? "Unsorted"}` : row.entry.kind === "framework" ? "Frameworks" : "Own work";
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  notes.set(`${MIRROR_FOLDER}/${PROJECT} - Index.md`, [
    frontmatter({ title: `${PROJECT} - Index`, tags: ["learnharness", "hub"], project: PROJECT, status: "current" }),
    "# LearnHarness Stage ledger",
    "",
    "A regenerated mirror of the Harness Stage ledger. Harness rewrites these notes; an edited note is left alone.",
    "",
    ...[...groups].flatMap(([group, rows]) => [
      `## ${group}`,
      "",
      "| Entry | Understand | Implement | Optimize | Serve |",
      "| --- | --- | --- | --- | --- |",
      ...rows.map(row => `| ${link(entryNotes.get(row.entry.id)!)} | ${row.stages.understand.state} | ${row.stages.implement.state} | ${row.stages.optimize.state} | ${row.stages.serve.state} |`),
      "",
    ]),
  ].join("\n"));
  const chainNotesOf = (id: EntryId) => mirroredChains.filter(chain => chainEntries.get(chain.id)!.includes(id)).map(chain => chainNotes.get(chain.id)!);
  return { notes, chainNotesOf };
}

function sourceText(entry: Entry): string {
  const source = entry.source;
  if (source.kind === "paper") return `arXiv [${source.arxivId}](https://arxiv.org/abs/${source.arxivId})`;
  if (source.kind === "framework") return `${source.repoUrl} at \`${source.commit}\``;
  return link(source.vaultNotePath);
}

const STAGE_FIELDS: Record<BuildStage, string> = {
  implement: "`reference` (what the implementation is checked against) and `tests` as `{ passed, total }`. It passes only when `tests.total > 0` and every test passed.",
  optimize: "`metric`, `unit`, `better` (`\"lower\"` or `\"higher\"`), `baseline`, `result`, `hardware` and `why` (one sentence on what made the difference). It passes only when `result` beats `baseline` in the `better` direction.",
  serve: "`endpoint`, `hardware`, `p50Ms`, `p95Ms`, `throughput` as `{ value, unit }` and `costPer1k` as `{ usd }`. It passes only with positive latencies, `p50Ms <= p95Ms`, positive throughput and a non-negative cost.",
};

export interface HandoffInput {
  entry: Entry;
  date: string;
  topic: string;
  stage: BuildStage;
  reference?: string;
  baseline?: string;
  target?: string;
  repo?: string;
  command?: string;
  chainNotes: string[];
}

export function handoffPath(date: string, topic: string): string {
  return `${MIRROR_FOLDER}/Handoffs/${PROJECT} - Handoff - ${date} - ${safeName(topic)}.md`;
}

export function handoffNote(input: HandoffInput): string {
  const { entry, stage } = input;
  if (stage === "implement" && !input.reference) throw new Error("An implement Handoff needs the reference to match.");
  if (stage === "optimize" && !input.baseline) throw new Error("An optimize Handoff needs the baseline to beat.");
  const notePath = handoffPath(input.date, input.topic);
  const repo = input.repo ?? "<repo>";
  return [
    frontmatter({
      title: path.basename(notePath, ".md"), tags: ["learnharness", "handoff"], project: PROJECT, status: "open",
      entry: entry.id, stage, reference: input.reference, baseline: input.baseline, target: input.target, repo: input.repo, command: input.command, lh_entry: entry.id,
    }),
    `# ${input.topic}`,
    "",
    `Build \`${entry.id}\` (${entry.title}) through ${stage}. Copy the entry id exactly; never invent one.`,
    "",
    "## What was understood",
    "",
    ...(input.chainNotes.length ? input.chainNotes.map(note => `- ${link(note)}`) : ["No reasoning chains are mirrored for this entry yet."]),
    ...(input.reference ? ["", "## Reference", "", input.reference] : []),
    ...(input.baseline ? ["", "## Baseline", "", input.baseline] : []),
    ...(input.target ? ["", "## Target", "", input.target] : []),
    ...(input.command ? ["", "## Command", "", `\`${input.command}\``] : []),
    "",
    "## Evidence to write",
    "",
    `Write one Evidence file, format \`lh-evidence/1\` (contracts/evidence/README.md in the LearnHarness plugins repo), at:`,
    "",
    `\`${repo}/evidence/${entry.id}/${stage}/<producedAt as YYYYMMDDTHHMMSSZ>.json\``,
    "",
    "Every file has `schema` (`\"lh-evidence/1\"`), `entry` (`" + entry.id + "`), `stage` (`\"" + stage + "\"`), `outcome` (`\"pass\"` or `\"fail\"`), `producedAt` (ISO 8601 UTC), `source` as `{ repo, commit }`, `command` (the exact command that produced the result) and, only on a failure that traces back to something not understood, `gap` as `{ concept, why }`.",
    "",
    `${stage === "serve" ? "A" : "An"} ${stage} file adds ${STAGE_FIELDS[stage]}`,
    "",
    "Files are append-only: a new attempt is a new file. Harness reads it from the repo's `evidence/` folder once the repo is a registered evidence root.",
    "",
  ].join("\n");
}

type ManifestKind = "mirror" | "handoff";
interface Manifest { version: 1; vaults: Record<string, { files: Record<string, { sha256: string; kind: ManifestKind }> }> }

export interface SyncReport { written: string[]; unchanged: number; deleted: string[]; kept: { path: string; reason: string }[] }

async function readManifest(file: string): Promise<Manifest> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as Manifest; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, vaults: {} };
    throw error;
  }
}

const currentHash = async (file: string) => fs.readFile(file).then(sha256, () => undefined);

export class VaultWriter {
  private readonly serialize = serialized();
  constructor(private readonly manifestFile: string) {}

  private async open(vaultPath: string) {
    if (!(await fs.stat(vaultPath).then(s => s.isDirectory(), () => false))) throw new Error(`The vault folder ${vaultPath} does not exist.`);
    const folder = path.join(vaultPath, MIRROR_FOLDER);
    if ((await fs.lstat(folder).catch(() => undefined))?.isSymbolicLink()) throw new Error(`Refusing to write through a linked ${folder}.`);
    const manifest = await readManifest(this.manifestFile);
    const files = (manifest.vaults[vaultPath] ??= { files: {} }).files;
    const resolve = (relative: string) => {
      const absolute = path.resolve(vaultPath, relative);
      if (!absolute.startsWith(folder + path.sep)) throw new Error(`Refusing to write outside ${folder}: ${relative}`);
      return absolute;
    };
    return { manifest, files, resolve };
  }

  sync(vaultPath: string, desired: Map<string, string>): Promise<SyncReport> {
    return this.serialize(async () => {
      const { manifest, files, resolve } = await this.open(vaultPath);
      const report: SyncReport = { written: [], unchanged: 0, deleted: [], kept: [] };
      for (const [relative, content] of desired) {
        const absolute = resolve(relative);
        const want = sha256(content), have = await currentHash(absolute), recorded = files[relative];
        if (have === undefined || (recorded && have === recorded.sha256 && have !== want)) {
          await writeFileAtomic(absolute, content);
          files[relative] = { sha256: want, kind: "mirror" };
          report.written.push(relative);
        } else if (have === want) {
          files[relative] = { sha256: want, kind: "mirror" };
          report.unchanged++;
        } else {
          report.kept.push({ path: relative, reason: recorded ? "edited since Harness wrote it" : "not created by Harness" });
        }
      }
      for (const [relative, record] of Object.entries(files)) {
        if (record.kind !== "mirror" || desired.has(relative)) continue;
        const absolute = resolve(relative);
        const have = await currentHash(absolute);
        if (have === record.sha256) {
          await fs.rm(absolute);
          report.deleted.push(relative);
        } else if (have !== undefined) {
          report.kept.push({ path: relative, reason: "edited since Harness wrote it; no longer mirrored" });
        }
        delete files[relative];
      }
      await writeFileAtomic(this.manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      return report;
    });
  }

  writeOnce(vaultPath: string, relative: string, content: string): Promise<string> {
    return this.serialize(async () => {
      const { manifest, files, resolve } = await this.open(vaultPath);
      const absolute = resolve(relative);
      const have = await currentHash(absolute);
      if (have !== undefined && have !== files[relative]?.sha256) throw new Error(`${relative} already exists and was edited; Harness will not overwrite it.`);
      await writeFileAtomic(absolute, content);
      files[relative] = { sha256: sha256(content), kind: "handoff" };
      await writeFileAtomic(this.manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      return absolute;
    });
  }
}

