import * as contract from "../../../contracts/evidence/validate.mjs";

export type Validation = { ok: true; evidence: Record<string, unknown> } | { ok: false; errors: string[] };

export const SCHEMA: string = contract.SCHEMA;
export const validateEvidence = contract.validateEvidence as (value: unknown) => Validation;
export const evidenceFileName = contract.evidenceFileName as (producedAt: string) => string;
