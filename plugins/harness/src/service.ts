import { readFileSync } from "node:fs";
import path from "node:path";
import type { PluginLearningData } from "learnharness-plugin-api";
import { ArxivClient, baseArxivId, type ArxivPaper } from "./arxiv.ts";
import { createEntries, parseEntryId, type Entry, type EntryId } from "./domain.ts";
import { scanEvidence, type ScanReport } from "./evidence.ts";
import { optionalText, requiredEntryId, requiredText } from "./input.ts";
import { frameworkName, MaterialDesk, paperEntry, type OwnWorkNote } from "./material.ts";
import { ledgerSnapshot, type LedgerSnapshot } from "./projection.ts";
import { seedEntries, type Roadmap } from "./seed.ts";
import { parseSettingsInput, readSettings, writeSettings, type HarnessSettings } from "./settings.ts";
import { LedgerStore } from "./store.ts";

export const LEDGER_TOPIC = "ledger";

export interface HarnessDeps {
  /** The plugin's code directory, holding seed/roadmap.json. */
  directory: string;
  dataDirectory: string;
  learning: PluginLearningData;
  /** Tell open views the ledger changed. */
  notify: (topic: string) => void;
  arxiv?: ArxivClient;
  fetcher?: typeof fetch;
}

export function createHarness(deps: HarnessDeps) {
  const store = new LedgerStore(path.join(deps.dataDirectory, "ledger.jsonl"));
  const settings = () => readSettings(deps.dataDirectory, deps.learning.directory);
  let lastScan: ScanReport | undefined;
  const seed = seedEntries(JSON.parse(readFileSync(path.join(deps.directory, "seed", "roadmap.json"), "utf8")) as Roadmap);
  const questions = new Map(seed.map(s => [s.entry.id as string, s.question]));
  const arxiv = deps.arxiv ?? new ArxivClient();
  const desk = new MaterialDesk(deps.dataDirectory, arxiv, deps.fetcher);
  const create = async (entries: Entry[]) => {
    const { appended } = await store.transact(state => createEntries(state, entries));
    if (appended.length) deps.notify(LEDGER_TOPIC);
    return appended.length;
  };
  const annotate = async (papers: ArxivPaper[]) => {
    const state = await store.read();
    return papers.map(paper => ({ ...paper, inLedger: Boolean(state.entries[`paper.${paper.id}` as EntryId]) }));
  };

  const rescan = async (): Promise<ScanReport> => {
    lastScan = await scanEvidence(store, (await settings()).evidenceRoots);
    if (lastScan.accepted + lastScan.rejected) deps.notify(LEDGER_TOPIC);
    return lastScan;
  };

  const operations = {
    async snapshot(): Promise<LedgerSnapshot & { scan?: ScanReport }> {
      return { ...ledgerSnapshot(await store.read()), scan: lastScan };
    },
    rescan,
    async seed(): Promise<{ created: number }> {
      return { created: await create(seed.map(s => s.entry)) };
    },
    async search(input: unknown) {
      return annotate(await arxiv.search(requiredText(input, "query")));
    },
    async feed() {
      return annotate(await arxiv.feed((await settings()).feedKeywords));
    },
    async paperDetails(input: unknown) {
      const arxivId = requiredText(input, "arxivId");
      const [alphaxiv, references] = await Promise.all([
        desk.alphaxiv(arxivId),
        desk.references(arxivId).then(list => ({ ok: true as const, list }), (error: Error) => ({ ok: false as const, error: error.message })),
      ]);
      return { alphaxiv, references };
    },
    async addPaper(input: unknown) {
      const arxivId = baseArxivId(requiredText(input, "arxivId"));
      const existing = (await store.read()).entries[`paper.${arxivId}` as EntryId];
      const title = existing?.title ?? (await arxiv.byIds([arxivId])).find(p => p.id === arxivId)?.title;
      if (!title) throw new Error(`arXiv has no paper ${arxivId}.`);
      const pdfPath = await desk.ensurePdf(arxivId);
      const entry = existing ?? paperEntry(arxivId, title, optionalText(input, "lineage"), pdfPath);
      await create([entry]);
      return { entryId: entry.id, pdfPath };
    },
    async addFramework(input: unknown) {
      const repoUrl = requiredText(input, "repoUrl");
      const name = optionalText(input, "name") ?? frameworkName(repoUrl);
      const id = parseEntryId(`framework.${name}`);
      if (!id) throw new Error(`framework.${name} is not a valid entry id. Use lowercase letters, digits and hyphens.`);
      const existing = (await store.read()).entries[id];
      const checkout = await desk.checkout(repoUrl, requiredText(input, "commit"));
      if (existing && (existing.source.kind !== "framework" || existing.source.commit !== checkout.commit)) {
        throw new Error(`${id} is already pinned to another source. Give this checkout a different name.`);
      }
      await create([existing ?? { id, kind: "framework", title: optionalText(input, "title") ?? name, source: { kind: "framework", repoUrl, commit: checkout.commit, checkoutPath: checkout.path } }]);
      return { entryId: id, checkoutPath: checkout.path, commit: checkout.commit };
    },
    async checkoutEntry(input: unknown) {
      const entry = (await store.read()).entries[requiredEntryId(input)];
      if (entry?.source.kind !== "framework") throw new Error("Only framework entries have a checkout.");
      return desk.checkout(entry.source.repoUrl, entry.source.commit);
    },
    async fetchPdf(input: unknown) {
      const entry = (await store.read()).entries[requiredEntryId(input)];
      if (entry?.source.kind !== "paper") throw new Error("Only paper entries have a PDF.");
      return { pdfPath: await desk.ensurePdf(entry.source.arxivId) };
    },
    async ownWork(): Promise<(OwnWorkNote & { inLedger: boolean })[]> {
      const state = await store.read();
      return (await desk.ownWorkNotes((await settings()).vaultPath)).map(note => ({ ...note, inLedger: Boolean(state.entries[note.entryId]) }));
    },
    async addOwnWork(input: unknown) {
      const relative = requiredText(input, "path");
      const { vaultPath } = await settings();
      const note = (await desk.ownWorkNotes(vaultPath)).find(n => n.path === relative);
      if (!note) throw new Error(`${relative} is not a Decision, Experiment or Architecture note in the vault.`);
      await create([{ id: note.entryId, kind: "own", title: path.basename(note.path, ".md"), source: { kind: "own", vaultNotePath: path.join(vaultPath, note.path) } }]);
      return { entryId: note.entryId };
    },
    getSettings: settings,
    async saveSettings(input: unknown): Promise<HarnessSettings> {
      const next = parseSettingsInput(input, await settings());
      await writeSettings(deps.dataDirectory, next);
      return next;
    },
  } satisfies Record<string, (input: unknown) => unknown>;

  return { store, operations, rescan, questions, desk };
}

export type Harness = ReturnType<typeof createHarness>;
