import { randomUUID } from "node:crypto";
import { access, constants, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "typebox";
import type { PluginBackendContext } from "learnharness-plugin-api";
import { estimatedCostUsd, isFinished, parseTemplate, type Run, type Template } from "./model.ts";
import { modalCli } from "./modal.ts";
import { runReport } from "./report.ts";
import { createRunDesk, type LaunchConfirmation } from "./runs.ts";
import { jsonFile } from "./store.ts";
import { NOT_CONFIGURED, readWandbKey, wandbReport, type WandbReport } from "./wandb.ts";

export const RUNS_TOPIC = "runs";
export const RUN_REPORT_TOOL = "run_report";
const POLL_INTERVAL_MS = 60_000;

export interface Settings {
  modalPath: string;
}

export interface RunRow extends Run {
  costUsd: number;
}

const defaultModalPath = () => path.join(os.homedir(), ".local", "bin", "modal");
const record = (input: unknown) => (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

export function activate(ctx: PluginBackendContext): () => void {
  const settingsFile = jsonFile<Partial<Settings>>(path.join(ctx.dataDirectory, "settings.json"), () => ({}));
  const templatesFile = jsonFile<{ version: 1; templates: Template[] }>(path.join(ctx.dataDirectory, "templates.json"), () => ({ version: 1, templates: [] }));
  const readSettings = async (): Promise<Settings> => ({ modalPath: defaultModalPath(), ...(await settingsFile.read()) });

  const desk = createRunDesk({
    dataDirectory: ctx.dataDirectory,
    cli: async () => {
      const { modalPath } = await readSettings();
      return { program: modalPath, cli: modalCli(modalPath) };
    },
    onChange: () => { if (!ctx.signal.aborted) ctx.events.emit(RUNS_TOPIC, {}); },
  });

  const wandbCache = new Map<string, WandbReport>();
  async function wandbFor(run: Run): Promise<WandbReport | undefined> {
    if (!run.wandbRunPath) return undefined;
    const cached = wandbCache.get(run.id);
    if (cached) return cached;
    const report = await wandbReport(run.wandbRunPath, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)]) });
    if (report.status === "ok" && isFinished(run.status)) wandbCache.set(run.id, report);
    return report;
  }

  async function evidenceOf(run: Run): Promise<Record<string, unknown> | undefined> {
    if (!run.evidenceFile) return undefined;
    return JSON.parse(await readFile(path.join(ctx.dataDirectory, run.evidenceFile), "utf8")) as Record<string, unknown>;
  }

  async function pickRun(runId?: string, entryId?: string): Promise<Run | undefined> {
    const runs = await desk.list();
    if (runId) return runs.find(run => run.id === runId);
    return entryId ? runs.find(run => run.template.entryId === entryId) : runs[0];
  }

  const poll = () => desk.poll().catch(error => console.error("[run-desk] poll failed:", error));
  void poll();
  const timer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);

  const unregister = [
    ctx.registerTools({
      agents: ["teacher", "practice"],
      create: () => [{
        name: RUN_REPORT_TOOL,
        label: "Run Desk report",
        description: "Read-only report of one Run Desk GPU run: status, cost estimate, final metrics, its Evidence file summary and a loss-curve summary from W&B. Defaults to the newest run, or the newest run for entryId. It cannot launch or stop runs.",
        parameters: Type.Object({
          runId: Type.Optional(Type.String({ description: "A Run Desk run id." })),
          entryId: Type.Optional(Type.String({ description: "A Harness entry id, such as paper.2006.11239; picks that entry's newest run." })),
        }),
        execute: async (_toolCallId: string, params: { runId?: string; entryId?: string }, signal?: AbortSignal) => {
          signal?.throwIfAborted();
          const run = await pickRun(params.runId, params.entryId);
          if (!run) return { content: [{ type: "text" as const, text: "Run Desk has no matching run." }], details: null };
          const text = runReport(run, await evidenceOf(run).catch(() => undefined), await wandbFor(run), new Date());
          return { content: [{ type: "text" as const, text }], details: { runId: run.id, status: run.status } };
        },
      }],
    }),
    ctx.handle("getSettings", readSettings),
    ctx.handle("saveSettings", async input => {
      const modalPath = String(record(input).modalPath ?? "").trim();
      if (!path.isAbsolute(modalPath)) throw new Error("Modal CLI path must be absolute.");
      await settingsFile.update(current => ({ ...current, modalPath }));
      return readSettings();
    }),
    ctx.handle("status", async () => {
      const { modalPath } = await readSettings();
      const modalFound = await access(modalPath, constants.X_OK).then(() => true, () => false);
      return { modalPath, modalFound, wandbConfigured: Boolean(await readWandbKey()), wandbNotice: NOT_CONFIGURED };
    }),
    ctx.handle("listTemplates", async () => (await templatesFile.read()).templates),
    ctx.handle("saveTemplate", async input => {
      const given = record(input).id;
      const id = typeof given === "string" && given ? given : randomUUID();
      const parsed = parseTemplate(input, id);
      if ("errors" in parsed) return parsed;
      await templatesFile.update(state => ({
        ...state,
        templates: state.templates.some(t => t.id === id) ? state.templates.map(t => (t.id === id ? parsed.template : t)) : [...state.templates, parsed.template],
      }));
      return parsed;
    }),
    ctx.handle("deleteTemplate", async input => {
      const id = String(record(input).id);
      await templatesFile.update(state => ({ ...state, templates: state.templates.filter(t => t.id !== id) }));
      return { ok: true };
    }),
    ctx.handle("listRuns", async (): Promise<RunRow[]> => {
      const now = new Date();
      return (await desk.list()).map(run => ({ ...run, costUsd: estimatedCostUsd(run, now) }));
    }),
    ctx.handle("runDetail", async input => {
      const run = await desk.get(String(record(input).id));
      const [evidence, logs, wandb] = await Promise.all([
        evidenceOf(run).catch(() => undefined),
        desk.logs(run.id).catch(error => `Could not read logs: ${(error as Error).message}`),
        wandbFor(run),
      ]);
      return { run: { ...run, costUsd: estimatedCostUsd(run, new Date()) }, evidence: evidence ?? null, logs, wandb: wandb ?? null };
    }),
    ctx.handle("launch", async input => {
      const { templateId, confirmed } = record(input) as { templateId?: string; confirmed?: LaunchConfirmation };
      const template = (await templatesFile.read()).templates.find(t => t.id === templateId);
      if (!template) throw new Error("That template no longer exists.");
      if (!confirmed) throw new Error("A launch needs the confirmed GPU, hourly estimate and max runtime.");
      return desk.launch(template, { gpu: confirmed.gpu, hourlyUsd: Number(confirmed.hourlyUsd), maxRuntimeMinutes: Number(confirmed.maxRuntimeMinutes) });
    }),
    ctx.handle("stop", async input => desk.stop(String(record(input).id))),
    ctx.handle("refresh", async () => { await desk.poll(); return { ok: true }; }),
  ];
  return () => {
    clearInterval(timer);
    for (const dispose of unregister.reverse()) dispose();
  };
}
