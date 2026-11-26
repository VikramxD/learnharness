import { SCHEMA, validateEvidence } from "./contract.ts";

export const RUN_STAGES = ["implement", "optimize", "serve"] as const;
export type Stage = (typeof RUN_STAGES)[number];

export interface Template {
  id: string;
  name: string;
  entryId: string;
  stage: Stage;
  script: string;
  args: string[];
  gpu: string;
  hourlyUsd: number;
  maxRuntimeMinutes: number;
  wandb?: { entity?: string; project?: string };
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "stopped";

/** Each status lists the statuses it may move to; finished statuses list none. */
export const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "failed", "stopped"],
  running: ["succeeded", "failed", "stopped"],
  succeeded: [],
  failed: [],
  stopped: [],
};

export const isFinished = (status: RunStatus) => TRANSITIONS[status].length === 0;

export interface Run {
  id: string;
  /** A copy of the template at launch, so later edits never rewrite history. */
  template: Template;
  appName: string;
  appId?: string;
  status: RunStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  maxRuntimeMinutes: number;
  command: string;
  source?: { repo: string; commit: string };
  evidenceFile?: string;
  outcome?: "pass" | "fail";
  wandbRunPath?: string;
  error?: string;
}

export function transition(run: Run, to: RunStatus, patch: Partial<Run> = {}): Run {
  if (!TRANSITIONS[run.status].includes(to)) throw new Error(`Run ${run.id} cannot go from ${run.status} to ${to}.`);
  return { ...run, ...patch, status: to };
}

export function estimatedCostUsd(run: Run, now: Date): number {
  if (!run.startedAt) return 0;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now.getTime();
  const hours = Math.max(0, end - Date.parse(run.startedAt)) / 3_600_000;
  return run.template.hourlyUsd * hours;
}

export const capCostUsd = (hourlyUsd: number, maxRuntimeMinutes: number) => (hourlyUsd * maxRuntimeMinutes) / 60;

/** Entry ids follow the evidence contract; ask the contract instead of copying its pattern. */
export function entryIdError(entry: string): string | undefined {
  const probe = validateEvidence({ schema: SCHEMA, entry });
  return probe.ok ? undefined : probe.errors.find(message => message.startsWith("entry"));
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Parse a template from the frontend; the only place template fields are checked. */
export function parseTemplate(input: unknown, id: string): { template: Template } | { errors: string[] } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = text(raw.name);
  const entryId = text(raw.entryId);
  const stage = raw.stage as Stage;
  const script = text(raw.script);
  const gpu = text(raw.gpu);
  const hourlyUsd = Number(raw.hourlyUsd);
  const maxRuntimeMinutes = Number(raw.maxRuntimeMinutes ?? 60);
  const args = Array.isArray(raw.args) ? raw.args.map(String).filter(arg => arg !== "") : [];
  if (!name) errors.push("Name is required.");
  const entryError = entryIdError(entryId);
  if (entryError) errors.push(entryError);
  if (!RUN_STAGES.includes(stage)) errors.push("Stage must be optimize, serve or implement.");
  if (!script.startsWith("/") || !script.endsWith(".py")) errors.push("Modal script must be an absolute path to a .py file.");
  if (!gpu) errors.push("GPU type is required, such as L4 or A100-80GB.");
  if (!Number.isFinite(hourlyUsd) || hourlyUsd <= 0) errors.push("Hourly cost estimate must be a positive number of dollars.");
  if (!Number.isInteger(maxRuntimeMinutes) || maxRuntimeMinutes < 1 || maxRuntimeMinutes > 24 * 60) errors.push("Max runtime must be 1 to 1440 whole minutes.");
  if (errors.length) return { errors };
  const wandbRaw = (typeof raw.wandb === "object" && raw.wandb !== null ? raw.wandb : {}) as Record<string, unknown>;
  const entity = text(wandbRaw.entity);
  const project = text(wandbRaw.project);
  const wandb = entity || project ? { ...(entity ? { entity } : {}), ...(project ? { project } : {}) } : undefined;
  return { template: { id, name, entryId, stage, script, args, gpu, hourlyUsd, maxRuntimeMinutes, ...(wandb ? { wandb } : {}) } };
}
