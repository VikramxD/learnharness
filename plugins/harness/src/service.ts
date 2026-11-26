import { readFileSync } from "node:fs";
import path from "node:path";
import type { PluginLearningData } from "learnharness-plugin-api";
import { ArxivClient, baseArxivId, isArxivId, type ArxivPaper } from "./arxiv.ts";
import { BUILD_STAGES, createEntries, lineagePrerequisites, linkSession, markUnderstood, parseEntryId, recordHandoff, stagesOf, unlinkSession, type BuildStage, type Entry, type EntryId, type LedgerState } from "./domain.ts";
import { scanEvidence, type ScanReport } from "./evidence.ts";
import { teachingGoal } from "./goal.ts";
import { optionalText, requiredEntryId, requiredText } from "./input.ts";
import { frameworkName, MaterialDesk, paperEntry, type OwnWorkNote } from "./material.ts";
import { ledgerSnapshot, type LedgerSnapshot } from "./projection.ts";
import { mentionNeedles, SessionReader } from "./sessions.ts";
import { seedEntries, type Roadmap } from "./seed.ts";
import { parseSettingsInput, readSettings, writeSettings, type HarnessSettings } from "./settings.ts";
import { LedgerStore } from "./store.ts";
import { handoffNote, handoffPath, mirrorNotes, VaultWriter, type SyncReport } from "./vault.ts";

export const LEDGER_TOPIC = "ledger";

export interface HarnessDeps {
  directory: string;
  dataDirectory: string;
  learning: PluginLearningData;
  notify: (topic: string) => void;
  arxiv?: ArxivClient;
  fetcher?: typeof fetch;
  now?: () => Date;
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
  const sessions = new SessionReader(deps.learning);
  const vault = new VaultWriter(path.join(deps.dataDirectory, "vault-manifest.json"));
  const mirror = async () => {
    const graph = deps.learning.graph();
    return mirrorNotes({ rows: ledgerSnapshot(await store.read()).entries, propositions: graph.propositions, chains: graph.chains, sessionTitles: graph.sessions });
  };
  const entryOf = (state: LedgerState, id: EntryId) => {
    const entry = state.entries[id];
    if (!entry) throw new Error(`Unknown entry ${id}.`);
    return entry;
  };
  const sessionView = async (state: LedgerState, id: EntryId) => {
    const entry = entryOf(state, id);
    return sessions.view(state.links[id] ?? [], mentionNeedles(entry, await desk.localPaths(entry)));
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
    listSessions: () => sessions.list(),
    async entrySessions(input: unknown) {
      const state = await store.read();
      const view = await sessionView(state, requiredEntryId(input));
      return { ...view, canMarkUnderstood: view.chainIds.length > 0 };
    },
    async linkSession(input: unknown) {
      const entryId = requiredEntryId(input), chatId = requiredText(input, "chatId");
      const { appended } = await store.transact(state => linkSession(state, entryId, chatId));
      if (appended.length) deps.notify(LEDGER_TOPIC);
      return { linked: appended.length > 0 };
    },
    async unlinkSession(input: unknown) {
      const entryId = requiredEntryId(input), chatId = requiredText(input, "chatId");
      const { appended } = await store.transact(state => unlinkSession(state, entryId, chatId));
      if (appended.length) deps.notify(LEDGER_TOPIC);
      return { unlinked: appended.length > 0 };
    },
    async markUnderstood(input: unknown) {
      const entryId = requiredEntryId(input);
      const view = await sessionView(await store.read(), entryId);
      await store.transact(state => markUnderstood(state, entryId, state.links[entryId] ?? [], view.chainIds));
      deps.notify(LEDGER_TOPIC);
      return { chainIds: view.chainIds };
    },
    async teachingGoal(input: unknown) {
      const state = await store.read();
      const entry = entryOf(state, requiredEntryId(input));
      const prerequisites = (entry.parentId ? [entryOf(state, entry.parentId), ...lineagePrerequisites(state, entry.parentId)] : lineagePrerequisites(state, entry.id))
        .filter(other => stagesOf(state, other.id).understand.state === "done");
      return {
        text: teachingGoal({ entry, paths: await desk.localPaths(entry), understoodPrerequisites: prerequisites, question: questions.get(entry.id), understand: stagesOf(state, entry.id).understand }),
      };
    },
    async syncVault(): Promise<SyncReport> {
      return vault.sync((await settings()).vaultPath, (await mirror()).notes);
    },
    async handOff(input: unknown) {
      const entryId = requiredEntryId(input);
      const stage = requiredText(input, "stage") as BuildStage;
      if (!BUILD_STAGES.includes(stage)) throw new Error("stage must be implement, optimize or serve.");
      const entry = entryOf(await store.read(), entryId);
      const { vaultPath } = await settings();
      const date = (deps.now?.() ?? new Date()).toLocaleDateString("en-CA");
      const topic = optionalText(input, "topic") ?? entry.title;
      const content = handoffNote({
        entry, date, topic, stage,
        reference: optionalText(input, "reference"), baseline: optionalText(input, "baseline"), target: optionalText(input, "target"),
        repo: optionalText(input, "repo"), command: optionalText(input, "command"),
        chainNotes: (await mirror()).chainNotesOf(entryId),
      });
      const notePath = await vault.writeOnce(vaultPath, handoffPath(date, topic), content);
      const { appended } = await store.transact(state => recordHandoff(state, entryId, notePath));
      if (appended.length) deps.notify(LEDGER_TOPIC);
      return { notePath };
    },
    async materialFetch(input: unknown) {
      const id = requiredText(input, "id");
      const state = await store.read();
      if (isArxivId(id)) {
        const entry = state.entries[`paper.${baseArxivId(id)}` as EntryId];
        return { entryId: entry?.id, title: entry?.title, pdfPath: await desk.ensurePdf(id) };
      }
      const entry = entryOf(state, requiredEntryId(input, "id"));
      if (entry.source.kind === "paper") return { entryId: entry.id, title: entry.title, pdfPath: await desk.ensurePdf(entry.source.arxivId) };
      const paths = await desk.localPaths(entry);
      if (entry.source.kind === "framework" && !paths.checkoutPath) {
        return { entryId: entry.id, title: entry.title, missing: `Not checked out yet. The learner can check out ${entry.source.repoUrl} at ${entry.source.commit} from the Material Desk.` };
      }
      return { entryId: entry.id, title: entry.title, ...paths };
    },
    async localPaths(input: unknown) {
      return desk.localPaths(entryOf(await store.read(), requiredEntryId(input)));
    },
    async ledgerStatus(input: unknown) {
      const state = await store.read();
      const rows = ledgerSnapshot(state).entries;
      const wanted = optionalText(input, "entryId");
      const pick = wanted ? rows.filter(row => row.entry.id === wanted) : rows;
      if (wanted && !pick.length) throw new Error(`Unknown entry ${wanted}.`);
      return Promise.all(pick.map(async row => ({
        id: row.entry.id, title: row.entry.title, lineage: row.entry.lineage, parentId: row.entry.parentId,
        understand: row.stages.understand.state === "reopened" ? `reopened (gap: ${row.stages.understand.gap.concept})` : row.stages.understand.state,
        implement: row.stages.implement.state, optimize: row.stages.optimize.state, serve: row.stages.serve.state,
        ...(wanted ? await desk.localPaths(row.entry) : {}),
      })));
    },
    getSettings: settings,
    async saveSettings(input: unknown): Promise<HarnessSettings> {
      const next = parseSettingsInput(input, await settings());
      await writeSettings(deps.dataDirectory, next);
      return next;
    },
  } satisfies Record<string, (input: unknown) => unknown>;

  return { store, operations, rescan, desk, sessions };
}

export type Harness = ReturnType<typeof createHarness>;
