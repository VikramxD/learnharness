import * as fs from "node:fs/promises";
import path from "node:path";
import { validateEvidence } from "../../../contracts/evidence/validate.mjs";
import { ingestEvidence, type DraftEvent, type LedgerState, type ValidationResult } from "./domain.ts";
import { exists, readDirectories, sha256 } from "./files.ts";
import type { LedgerStore } from "./store.ts";

export interface EvidenceFile {
  file: string;
  sha256: string;
  location: { entry: string; stage: string };
  result: ValidationResult;
}

export interface RootStatus { root: string; directory: string; found: boolean; files: number }
export interface ScanReport { roots: RootStatus[]; accepted: number; rejected: number }

export async function evidenceDirectory(root: string): Promise<string> {
  const nested = path.join(root, "evidence");
  return (await fs.stat(nested).then(s => s.isDirectory(), () => false)) ? nested : root;
}

function parse(text: string): ValidationResult {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { return { ok: false, errors: [`not valid JSON: ${(error as Error).message}`] }; }
  return validateEvidence(value) as ValidationResult;
}

export async function readEvidenceRoot(root: string): Promise<{ status: RootStatus; files: EvidenceFile[] }> {
  const directory = await evidenceDirectory(root);
  const found = await exists(directory);
  const files: EvidenceFile[] = [];
  for (const entry of await readDirectories(directory)) {
    for (const stage of await readDirectories(path.join(directory, entry))) {
      const stageDirectory = path.join(directory, entry, stage);
      for (const name of (await fs.readdir(stageDirectory)).filter(name => name.endsWith(".json") && !name.startsWith(".")).sort()) {
        const file = path.join(stageDirectory, name);
        const bytes = await fs.readFile(file);
        files.push({ file, sha256: sha256(bytes), location: { entry, stage }, result: parse(bytes.toString("utf8")) });
      }
    }
  }
  return { status: { root, directory, found, files: files.length }, files };
}

export function decideIngest(state: LedgerState, files: readonly EvidenceFile[]): DraftEvent[] {
  return files.flatMap(f => ingestEvidence(state, f.file, f.sha256, f.result, f.location));
}

export async function scanEvidence(store: LedgerStore, roots: readonly string[]): Promise<ScanReport> {
  const read = await Promise.all(roots.map(readEvidenceRoot));
  const { appended } = await store.transact(state => decideIngest(state, read.flatMap(r => r.files)));
  return {
    roots: read.map(r => r.status),
    accepted: appended.filter(e => e.type === "EvidenceAccepted").length,
    rejected: appended.filter(e => e.type === "EvidenceRejected").length,
  };
}
