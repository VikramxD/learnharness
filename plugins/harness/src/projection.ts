import { orphanEvidence, stagesOf, type Entry, type EntryId, type EntryStages, type EvidenceRecord, type LedgerState, type Rejection } from "./domain.ts";

export interface EntryRow {
  entry: Entry;
  stages: EntryStages;
  chatIds: string[];
  handoffs: string[];
  evidenceNewestFirst: EvidenceRecord[];
}

export interface LedgerSnapshot {
  entries: EntryRow[];
  rejected: Rejection[];
  orphans: { entryId: EntryId; files: string[] }[];
}

export function entryRow(state: LedgerState, id: EntryId): EntryRow {
  return {
    entry: state.entries[id]!,
    stages: stagesOf(state, id),
    chatIds: state.links[id] ?? [],
    handoffs: state.handoffs[id] ?? [],
    evidenceNewestFirst: [...(state.evidence[id] ?? [])].sort((a, b) => Date.parse(b.evidence.producedAt) - Date.parse(a.evidence.producedAt) || b.seq - a.seq),
  };
}

export function ledgerSnapshot(state: LedgerState): LedgerSnapshot {
  return {
    entries: state.creationOrder.map(id => entryRow(state, id)),
    rejected: Object.values(state.rejected).sort((a, b) => b.at.localeCompare(a.at)),
    orphans: orphanEvidence(state).map(entryId => ({ entryId, files: (state.evidence[entryId] ?? []).map(r => r.file) })),
  };
}
