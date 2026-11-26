export type EntryId = string & { readonly __brand: "EntryId" };
export type EntryKind = "paper" | "framework" | "own";

const ENTRY_ID = /^(paper\.[0-9]{4}\.[0-9]{4,5}(v[0-9]+)?|framework\.[a-z0-9-]+(\.[a-z0-9-]+)*|own\.[a-z0-9-]+\.[a-z0-9-]+)$/;

export function parseEntryId(value: unknown): EntryId | undefined {
  return typeof value === "string" && ENTRY_ID.test(value) ? (value as EntryId) : undefined;
}

export function entryKindOf(id: EntryId): EntryKind {
  return id.slice(0, id.indexOf(".")) as EntryKind;
}

export type EntrySource =
  | { kind: "paper"; arxivId: string; pdfPath?: string }
  | { kind: "framework"; repoUrl: string; commit: string; checkoutPath?: string }
  | { kind: "own"; vaultNotePath: string };

export interface Entry {
  id: EntryId;
  kind: EntryKind;
  title: string;
  parentId?: EntryId;
  lineage?: string;
  source: EntrySource;
}

export const BUILD_STAGES = ["implement", "optimize", "serve"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];
export type Stage = "understand" | BuildStage;

export interface Gap { concept: string; why: string }

interface EvidenceCommon {
  schema: "lh-evidence/1";
  entry: string;
  outcome: "pass" | "fail";
  producedAt: string;
  source: { repo: string; commit: string };
  command: string;
  gap?: Gap;
}
export type Evidence =
  | (EvidenceCommon & { stage: "implement"; reference: string; tests: { passed: number; total: number } })
  | (EvidenceCommon & { stage: "optimize"; metric: string; unit: string; better: "lower" | "higher"; baseline: number; result: number; hardware: string; why: string })
  | (EvidenceCommon & { stage: "serve"; endpoint: string; hardware: string; p50Ms: number; p95Ms: number; throughput: { value: number; unit: string }; costPer1k: { usd: number } });

type EventBody =
  | { type: "EntryCreated"; entry: Entry }
  | { type: "SessionLinked"; entryId: EntryId; chatId: string }
  | { type: "SessionUnlinked"; entryId: EntryId; chatId: string }
  | { type: "MarkedUnderstood"; entryId: EntryId; chatIds: string[]; chainIds: string[] }
  | { type: "EvidenceAccepted"; entryId: EntryId; stage: BuildStage; file: string; sha256: string; evidence: Evidence }
  | { type: "EvidenceRejected"; file: string; sha256: string; errors: string[] }
  | { type: "HandoffWritten"; entryId: EntryId; notePath: string };

export type LedgerEvent = EventBody & { id: string; at: string };
export type DraftEvent = EventBody;

export interface EvidenceRecord { file: string; sha256: string; evidence: Evidence; at: string; seq: number }
export interface Rejection { file: string; sha256: string; errors: string[]; at: string }
interface Understanding { chatIds: string[]; chainIds: string[]; at: string; seq: number }

export interface LedgerState {
  /** Entry ids in creation order; lineage order is creation order. */
  order: EntryId[];
  entries: Record<EntryId, Entry>;
  links: Record<EntryId, string[]>;
  understood: Record<EntryId, Understanding>;
  evidence: Record<EntryId, EvidenceRecord[]>;
  /** Latest rejection per file path; a later acceptance of the same path clears it. */
  rejected: Record<string, Rejection>;
  /** file + NUL + sha256 of every evidence file already ingested. */
  ingested: Record<string, true>;
  handoffs: Record<EntryId, string[]>;
  seq: number;
}

export const emptyLedger = (): LedgerState => ({ order: [], entries: {}, links: {}, understood: {}, evidence: {}, rejected: {}, ingested: {}, handoffs: {}, seq: 0 });

export const ingestKey = (file: string, sha256: string) => `${file}\u0000${sha256}`;

export function reduce(state: LedgerState, event: LedgerEvent): LedgerState {
  const seq = state.seq + 1;
  const next = { ...state, seq };
  switch (event.type) {
    case "EntryCreated": {
      if (state.entries[event.entry.id]) return next;
      return { ...next, order: [...state.order, event.entry.id], entries: { ...state.entries, [event.entry.id]: event.entry } };
    }
    case "SessionLinked": {
      const current = state.links[event.entryId] ?? [];
      if (current.includes(event.chatId)) return next;
      return { ...next, links: { ...state.links, [event.entryId]: [...current, event.chatId] } };
    }
    case "SessionUnlinked":
      return { ...next, links: { ...state.links, [event.entryId]: (state.links[event.entryId] ?? []).filter(id => id !== event.chatId) } };
    case "MarkedUnderstood":
      return { ...next, understood: { ...state.understood, [event.entryId]: { chatIds: event.chatIds, chainIds: event.chainIds, at: event.at, seq } } };
    case "EvidenceAccepted": {
      const record: EvidenceRecord = { file: event.file, sha256: event.sha256, evidence: event.evidence, at: event.at, seq };
      const { [event.file]: _cleared, ...rejected } = state.rejected;
      return {
        ...next,
        evidence: { ...state.evidence, [event.entryId]: [...(state.evidence[event.entryId] ?? []), record] },
        rejected,
        ingested: { ...state.ingested, [ingestKey(event.file, event.sha256)]: true },
      };
    }
    case "EvidenceRejected":
      return {
        ...next,
        rejected: { ...state.rejected, [event.file]: { file: event.file, sha256: event.sha256, errors: event.errors, at: event.at } },
        ingested: { ...state.ingested, [ingestKey(event.file, event.sha256)]: true },
      };
    case "HandoffWritten": {
      const current = state.handoffs[event.entryId] ?? [];
      return { ...next, handoffs: { ...state.handoffs, [event.entryId]: current.includes(event.notePath) ? current : [...current, event.notePath] } };
    }
  }
}

export const fold = (events: readonly LedgerEvent[], initial: LedgerState = emptyLedger()): LedgerState => events.reduce(reduce, initial);

export type UnderstandStatus =
  | { state: "open" }
  | { state: "linked"; chatIds: string[] }
  | { state: "done"; chatIds: string[]; chainIds: string[]; at: string }
  | { state: "reopened"; gap: Gap & { stage: BuildStage; file: string }; chatIds: string[] };

export type BuildStatus =
  | { state: "open" }
  | { state: "done"; evidence: EvidenceRecord }
  | { state: "failed"; evidence: EvidenceRecord };

export interface EntryStages {
  understand: UnderstandStatus;
  implement: BuildStatus;
  optimize: BuildStatus;
  serve: BuildStatus;
}

const newer = (a: EvidenceRecord, b: EvidenceRecord) => {
  const byTime = Date.parse(a.evidence.producedAt) - Date.parse(b.evidence.producedAt);
  return byTime !== 0 ? byTime > 0 : a.seq > b.seq;
};

export function newestEvidence(state: LedgerState, id: EntryId, stage: BuildStage): EvidenceRecord | undefined {
  let best: EvidenceRecord | undefined;
  for (const record of state.evidence[id] ?? []) {
    if (record.evidence.stage === stage && (!best || newer(record, best))) best = record;
  }
  return best;
}

export function stagesOf(state: LedgerState, id: EntryId): EntryStages {
  const build = Object.fromEntries(BUILD_STAGES.map(stage => {
    const record = newestEvidence(state, id, stage);
    const status: BuildStatus = !record ? { state: "open" } : record.evidence.outcome === "pass" ? { state: "done", evidence: record } : { state: "failed", evidence: record };
    return [stage, status];
  })) as Record<BuildStage, BuildStatus>;

  const linked = state.links[id] ?? [];
  const understood = state.understood[id];
  let gapRecord: EvidenceRecord | undefined;
  for (const stage of BUILD_STAGES) {
    const status = build[stage];
    if (status.state !== "failed" || !status.evidence.evidence.gap) continue;
    if (understood && understood.seq > status.evidence.seq) continue;
    if (!gapRecord || status.evidence.seq > gapRecord.seq) gapRecord = status.evidence;
  }

  let understand: UnderstandStatus;
  if (gapRecord?.evidence.gap) {
    understand = { state: "reopened", gap: { ...gapRecord.evidence.gap, stage: gapRecord.evidence.stage, file: gapRecord.file }, chatIds: linked };
  } else if (understood) {
    understand = { state: "done", chatIds: understood.chatIds, chainIds: understood.chainIds, at: understood.at };
  } else if (linked.length) {
    understand = { state: "linked", chatIds: linked };
  } else {
    understand = { state: "open" };
  }
  return { understand, ...build };
}

/** Entries earlier in the same lineage, in lineage order. */
export function lineagePrerequisites(state: LedgerState, id: EntryId): Entry[] {
  const entry = state.entries[id];
  if (!entry?.lineage) return [];
  const position = state.order.indexOf(id);
  return state.order.slice(0, position).map(other => state.entries[other]!).filter(other => other.lineage === entry.lineage);
}

/** Evidence for ids that are not (yet) entries in the ledger. */
export function orphanEvidence(state: LedgerState): EntryId[] {
  return (Object.keys(state.evidence) as EntryId[]).filter(id => !state.entries[id]);
}

// Commands: pure decisions from the current state to the events that move it. Each returns no
// events when the goal already holds, so retries and re-scans converge.

export function createEntries(state: LedgerState, entries: readonly Entry[]): DraftEvent[] {
  const seen = new Set<string>();
  return entries.filter(entry => !state.entries[entry.id] && !seen.has(entry.id) && seen.add(entry.id)).map(entry => ({ type: "EntryCreated", entry }));
}

export function linkSession(state: LedgerState, entryId: EntryId, chatId: string): DraftEvent[] {
  if (!state.entries[entryId]) throw new Error(`Unknown entry ${entryId}.`);
  return (state.links[entryId] ?? []).includes(chatId) ? [] : [{ type: "SessionLinked", entryId, chatId }];
}

export function unlinkSession(state: LedgerState, entryId: EntryId, chatId: string): DraftEvent[] {
  return (state.links[entryId] ?? []).includes(chatId) ? [{ type: "SessionUnlinked", entryId, chatId }] : [];
}

export function markUnderstood(state: LedgerState, entryId: EntryId, chatIds: string[], chainIds: string[]): DraftEvent[] {
  if (!state.entries[entryId]) throw new Error(`Unknown entry ${entryId}.`);
  if (!chainIds.length) throw new Error("Mark understood needs at least one reasoning chain from a linked session.");
  return [{ type: "MarkedUnderstood", entryId, chatIds, chainIds }];
}

export type ValidationResult = { ok: true; evidence: Evidence } | { ok: false; errors: string[] };

/** `location` is the entry id and stage named by the file's folders, when it sits in the documented layout. */
export function ingestEvidence(state: LedgerState, file: string, sha256: string, result: ValidationResult, location?: { entry: string; stage: string }): DraftEvent[] {
  if (state.ingested[ingestKey(file, sha256)]) return [];
  const errors = result.ok ? [] : [...result.errors];
  if (result.ok && location && (location.entry !== result.evidence.entry || location.stage !== result.evidence.stage)) {
    errors.push(`file sits under ${location.entry}/${location.stage} but declares ${result.evidence.entry}/${result.evidence.stage}.`);
  }
  if (!result.ok || errors.length) return [{ type: "EvidenceRejected", file, sha256, errors }];
  return [{ type: "EvidenceAccepted", entryId: result.evidence.entry as EntryId, stage: result.evidence.stage, file, sha256, evidence: result.evidence }];
}

export function recordHandoff(state: LedgerState, entryId: EntryId, notePath: string): DraftEvent[] {
  return (state.handoffs[entryId] ?? []).includes(notePath) ? [] : [{ type: "HandoffWritten", entryId, notePath }];
}
