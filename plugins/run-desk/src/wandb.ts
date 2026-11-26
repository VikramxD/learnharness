import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const WANDB_GRAPHQL = "https://api.wandb.ai/graphql";
export const NOT_CONFIGURED = "W&B not configured: add a machine api.wandb.ai entry with your API key to ~/.netrc to see metrics.";

export interface LossCurve {
  key: string;
  points: number;
  firstStep: number;
  lastStep: number;
  first: number;
  last: number;
  min: number;
  minStep: number;
  changePct: number;
  trend: "falling" | "flat" | "rising";
}

export type WandbReport =
  | { status: "not-configured"; notice: string }
  | { status: "error"; error: string }
  | { status: "ok"; path: string; state: string; summary: Record<string, number>; loss?: LossCurve };

/** The api.wandb.ai password from a netrc file, or undefined. The key never leaves this module. */
export function netrcKey(netrc: string): string | undefined {
  const tokens = netrc.split(/\s+/).filter(Boolean);
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== "machine" || tokens[index + 1] !== "api.wandb.ai") continue;
    for (let field = index + 2; field < tokens.length && tokens[field] !== "machine"; field += 2) {
      if (tokens[field] === "password") return tokens[field + 1];
    }
  }
  return undefined;
}

export async function readWandbKey(home = os.homedir()): Promise<string | undefined> {
  return netrcKey(await readFile(path.join(home, ".netrc"), "utf8").catch(() => ""));
}

const SUMMARY_QUERY = `query RunDeskSummary($entity: String!, $project: String!, $run: String!) {
  project(name: $project, entityName: $entity) { run(name: $run) { state summaryMetrics } }
}`;
const HISTORY_QUERY = `query RunDeskHistory($entity: String!, $project: String!, $run: String!, $specs: [JSONString!]!) {
  project(name: $project, entityName: $entity) { run(name: $run) { sampledHistory(specs: $specs) } }
}`;

export function pickLossKey(summary: Record<string, unknown>): string | undefined {
  const keys = Object.keys(summary).filter(key => typeof summary[key] === "number" && /loss/i.test(key));
  return keys.find(key => key === "loss") ?? keys.find(key => /(^|\/)loss$/i.test(key)) ?? keys.sort()[0];
}

export function summarizeLoss(key: string, rows: Record<string, unknown>[]): LossCurve | undefined {
  const points = rows
    .map(row => ({ step: Number(row._step), value: row[key] }))
    .filter((point): point is { step: number; value: number } => Number.isFinite(point.step) && typeof point.value === "number" && Number.isFinite(point.value))
    .sort((a, b) => a.step - b.step);
  if (!points.length) return undefined;
  const first = points[0]!, last = points.at(-1)!;
  const lowest = points.reduce((best, point) => (point.value < best.value ? point : best));
  const window = Math.max(1, Math.floor(points.length / 10));
  const mean = (slice: typeof points) => slice.reduce((sum, point) => sum + point.value, 0) / slice.length;
  const recent = mean(points.slice(-window));
  const before = mean(points.slice(-2 * window, -window).length ? points.slice(-2 * window, -window) : points.slice(0, window));
  const drift = before === 0 ? 0 : (recent - before) / Math.abs(before);
  return {
    key, points: points.length, firstStep: first.step, lastStep: last.step, first: first.value, last: last.value,
    min: lowest.value, minStep: lowest.step,
    changePct: first.value === 0 ? 0 : ((last.value - first.value) / Math.abs(first.value)) * 100,
    trend: drift < -0.01 ? "falling" : drift > 0.01 ? "rising" : "flat",
  };
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Read summary metrics and a sampled loss curve for `entity/project/run`; every failure is a value, never a throw. */
export async function wandbReport(runPath: string, options: { key?: string; fetch?: Fetch; signal?: AbortSignal } = {}): Promise<WandbReport> {
  const key = options.key ?? (await readWandbKey());
  if (!key) return { status: "not-configured", notice: NOT_CONFIGURED };
  const [entity, project, run] = runPath.split("/");
  const fetcher = options.fetch ?? (fetch as unknown as Fetch);
  const ask = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetcher(WANDB_GRAPHQL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` },
      body: JSON.stringify({ query, variables: { entity, project, run, ...variables } }),
      signal: options.signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`W&B answered HTTP ${response.status}.`);
    const body = (await response.json()) as { data?: { project?: { run?: Record<string, unknown> | null } | null }; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`W&B: ${body.errors.map(error => error.message).join("; ")}`);
    const found = body.data?.project?.run;
    if (!found) throw new Error(`W&B has no run ${runPath}.`);
    return found;
  };
  try {
    const head = await ask(SUMMARY_QUERY, {});
    const raw = typeof head.summaryMetrics === "string" ? (JSON.parse(head.summaryMetrics) as Record<string, unknown>) : {};
    const summary = Object.fromEntries(Object.entries(raw).filter(([name, value]) => typeof value === "number" && (!name.startsWith("_") || name === "_runtime"))) as Record<string, number>;
    const lossKey = pickLossKey(summary);
    let loss: LossCurve | undefined;
    if (lossKey) {
      const history = await ask(HISTORY_QUERY, { specs: [JSON.stringify({ keys: ["_step", lossKey], samples: 500 })] });
      const rows = Array.isArray(history.sampledHistory) ? (history.sampledHistory[0] as Record<string, unknown>[] | undefined) ?? [] : [];
      loss = summarizeLoss(lossKey, rows);
    }
    return { status: "ok", path: runPath, state: String(head.state ?? "unknown"), summary, ...(loss ? { loss } : {}) };
  } catch (error) {
    return { status: "error", error: (error as Error).message };
  }
}
