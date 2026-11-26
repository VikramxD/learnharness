import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { evidenceFileName, SCHEMA, validateEvidence } from "./contract.ts";
import type { Run } from "./model.ts";

export const EVIDENCE_MARKER = "LH_EVIDENCE";

export type EvidenceLine = { fields: Record<string, unknown> } | { error: string };

export function findEvidenceLine(logs: string): EvidenceLine | undefined {
  const line = logs.split(/\r?\n/).reverse().find(candidate => candidate.includes(`${EVIDENCE_MARKER} `));
  if (line === undefined) return undefined;
  const json = line.slice(line.indexOf(`${EVIDENCE_MARKER} `) + EVIDENCE_MARKER.length + 1).trim();
  try {
    const fields: unknown = JSON.parse(json);
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return { error: `${EVIDENCE_MARKER} must carry a JSON object.` };
    return { fields: fields as Record<string, unknown> };
  } catch (error) {
    return { error: `${EVIDENCE_MARKER} line is not valid JSON: ${(error as Error).message}` };
  }
}

export type Assembled =
  | { kind: "valid"; evidence: Record<string, unknown> }
  | { kind: "downgraded"; evidence: Record<string, unknown>; errors: string[] }
  | { kind: "invalid"; errors: string[] };

export function assembleEvidence(run: Run, line: EvidenceLine | undefined, producedAt: string): Assembled {
  const lineErrors = line === undefined ? [`The run printed no ${EVIDENCE_MARKER} line.`] : "error" in line ? [line.error] : [];
  const fields = line && "fields" in line ? line.fields : {};
  const owned = {
    schema: SCHEMA,
    entry: run.template.entryId,
    stage: run.template.stage,
    producedAt,
    ...(run.source ? { source: run.source } : {}),
    command: run.command,
  };
  const claimed = { ...fields, ...owned };
  const asClaimed = validateEvidence(claimed);
  if (asClaimed.ok && !lineErrors.length) return { kind: "valid", evidence: claimed };
  const errors = [...lineErrors, ...(asClaimed.ok ? [] : asClaimed.errors)];
  const asFail = validateEvidence({ ...claimed, outcome: "fail" });
  return asFail.ok ? { kind: "downgraded", evidence: { ...claimed, outcome: "fail" }, errors } : { kind: "invalid", errors };
}

export async function writeEvidenceOnce(dataDirectory: string, evidence: Record<string, unknown>): Promise<string> {
  const relative = path.join("evidence", String(evidence.entry), String(evidence.stage), evidenceFileName(String(evidence.producedAt)));
  const target = path.join(dataDirectory, relative);
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  const existing = await readFile(target, "utf8").catch(() => undefined);
  if (existing === body) return relative;
  if (existing !== undefined) throw new Error(`Evidence file ${relative} already exists with other content.`);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, body);
  await rename(temporary, target);
  return relative;
}
