import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleEvidence, findEvidenceLine, writeEvidenceOnce } from "./evidence.ts";
import { isFinished, transition, type Run, type RunStatus, type Template } from "./model.ts";
import { isStoppedState, type ModalApp, type ModalCli } from "./modal.ts";
import { jsonFile } from "./store.ts";

export interface LaunchConfirmation {
  gpu: string;
  hourlyUsd: number;
  maxRuntimeMinutes: number;
}

export interface RunDeskDeps {
  dataDirectory: string;
  cli: () => Promise<{ program: string; cli: ModalCli }>;
  now?: () => Date;
  gitSource?: (directory: string) => Promise<{ repo: string; commit: string }>;
  onChange?: () => void;
}

const QUEUED_GRACE_MS = 5 * 60_000;
const LOG_LIMIT = 64 * 1024;
const WANDB_URL = /https:\/\/wandb\.ai\/([^/\s]+)\/([^/\s]+)\/runs\/([A-Za-z0-9_-]+)/g;

const quote = (part: string) => (/^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replace(/'/g, `'\\''`)}'`);
const tail = (value: string) => (value.length > LOG_LIMIT ? value.slice(-LOG_LIMIT) : value);

function git(directory: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", directory, ...args], { timeout: 10_000 }, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())));
  });
}

export async function gitSourceOf(directory: string): Promise<{ repo: string; commit: string }> {
  try {
    return { repo: await git(directory, ["rev-parse", "--show-toplevel"]), commit: await git(directory, ["rev-parse", "HEAD"]) };
  } catch {
    throw new Error(`${directory} is not inside a git repo with a commit, so its evidence could not name source.commit.`);
  }
}

export function wandbRunPathIn(logs: string, template: Template): string | undefined {
  const found = [...logs.matchAll(WANDB_URL)].map(match => ({ entity: match[1]!, project: match[2]!, run: match[3]! }));
  const wanted = template.wandb;
  const chosen = found.findLast(item => (!wanted?.entity || item.entity === wanted.entity) && (!wanted?.project || item.project === wanted.project));
  return chosen && `${chosen.entity}/${chosen.project}/${chosen.run}`;
}

export function createRunDesk(deps: RunDeskDeps) {
  const now = deps.now ?? (() => new Date());
  const gitSource = deps.gitSource ?? gitSourceOf;
  const store = jsonFile<{ version: 1; runs: Run[] }>(path.join(deps.dataDirectory, "runs.json"), () => ({ version: 1, runs: [] }));
  const logsDirectory = path.join(deps.dataDirectory, "runs");
  const launchLog = (id: string) => path.join(logsDirectory, `${id}.launch.log`);
  const modalLog = (id: string) => path.join(logsDirectory, `${id}.modal.log`);
  const launching = new Set<string>();

  const list = async () => (await store.read()).runs;
  const get = async (id: string) => {
    const run = (await list()).find(candidate => candidate.id === id);
    if (!run) throw new Error(`No run ${id}.`);
    return run;
  };

  async function patchIfStatus(id: string, expected: RunStatus, change: (run: Run) => Run): Promise<Run | undefined> {
    let changed: Run | undefined;
    await store.update(state => ({
      ...state,
      runs: state.runs.map(run => {
        if (run.id !== id || run.status !== expected) return run;
        changed = change(run);
        return changed;
      }),
    }));
    if (changed) deps.onChange?.();
    return changed;
  }

  async function launch(template: Template, confirmed: LaunchConfirmation): Promise<Run> {
    if (confirmed.gpu !== template.gpu || confirmed.hourlyUsd !== template.hourlyUsd) {
      throw new Error("The confirmed GPU or hourly estimate no longer matches the template. Reopen the launch dialog.");
    }
    if (!Number.isInteger(confirmed.maxRuntimeMinutes) || confirmed.maxRuntimeMinutes < 1 || confirmed.maxRuntimeMinutes > 1440) {
      throw new Error("Max runtime must be 1 to 1440 whole minutes.");
    }
    if (!(await stat(template.script).catch(() => undefined))?.isFile()) throw new Error(`Modal script ${template.script} does not exist.`);
    const cwd = path.dirname(template.script);
    const source = await gitSource(cwd);
    const { program, cli } = await deps.cli();
    const id = `${now().toISOString().replace(/[-:.]/g, "").slice(0, 15)}-${randomUUID().slice(0, 6)}`;
    const appName = `lh-run-desk-${id}`;
    const run: Run = {
      id, template, appName, status: "queued", queuedAt: now().toISOString(), maxRuntimeMinutes: confirmed.maxRuntimeMinutes,
      command: [program, ...cli.launchArgs(appName, template.script, template.args)].map(quote).join(" "), source,
    };
    await mkdir(logsDirectory, { recursive: true });
    await store.update(state => ({ ...state, runs: [run, ...state.runs] }));
    deps.onChange?.();
    launching.add(id);
    try {
      const { appId } = await cli.launch({
        appName, script: template.script, args: template.args, cwd, logFile: launchLog(id),
        env: { LH_RUN_ID: id, LH_GPU: template.gpu, LH_MAX_RUNTIME_SECONDS: String(confirmed.maxRuntimeMinutes * 60) },
        onExit: () => { poll().catch(error => console.error("[run-desk] poll after modal run exited:", error)); },
      });
      return (await patchIfStatus(id, "queued", current => transition(current, "running", { appId, startedAt: now().toISOString() }))) ?? get(id);
    } catch (error) {
      return (await patchIfStatus(id, "queued", current => transition(current, "failed", { finishedAt: now().toISOString(), error: (error as Error).message }))) ?? get(id);
    } finally {
      launching.delete(id);
    }
  }

  async function readLogs(run: Run, cli: ModalCli): Promise<string> {
    const local = await readFile(launchLog(run.id), "utf8").catch(() => "");
    const remote = run.appId ? await cli.logs(run.appId).catch(error => `[Run Desk] Could not fetch Modal logs: ${(error as Error).message}`) : "";
    return `${local}\n${remote}`;
  }

  async function finish(run: Run, cli: ModalCli): Promise<void> {
    const marked = run.finishedAt ? run : await patchIfStatus(run.id, "running", current => ({ ...current, finishedAt: now().toISOString() }));
    if (!marked?.finishedAt) return;
    const logs = await readLogs(marked, cli);
    await writeFile(modalLog(marked.id), tail(logs));
    const assembled = assembleEvidence(marked, findEvidenceLine(logs), marked.finishedAt);
    const evidence = assembled.kind === "invalid" ? undefined : assembled.evidence;
    const evidenceFile = evidence && await writeEvidenceOnce(deps.dataDirectory, evidence);
    const wandbRunPath = wandbRunPathIn(logs, marked.template);
    await patchIfStatus(marked.id, "running", current => transition(current, assembled.kind === "valid" ? "succeeded" : "failed", {
      ...(evidence && evidenceFile ? { evidenceFile, outcome: evidence.outcome as "pass" | "fail" } : {}),
      ...(wandbRunPath ? { wandbRunPath } : {}),
      ...(assembled.kind === "valid" ? {} : { error: assembled.errors.join(" ") }),
    }));
  }

  async function reconcile(run: Run, apps: ModalApp[], cli: ModalCli): Promise<void> {
    if (run.status === "queued") {
      if (launching.has(run.id)) return;
      const app = apps.find(candidate => candidate.description === run.appName);
      if (app) await patchIfStatus(run.id, "queued", current => transition(current, "running", { appId: app.appId, startedAt: current.queuedAt }));
      else if (now().getTime() - Date.parse(run.queuedAt) > QUEUED_GRACE_MS) {
        await patchIfStatus(run.id, "queued", current => transition(current, "failed", { finishedAt: now().toISOString(), error: "The launch never reached Modal." }));
      }
      return;
    }
    const app = apps.find(candidate => candidate.appId === run.appId);
    if (app && !isStoppedState(app.state) && !run.finishedAt) {
      const elapsed = now().getTime() - Date.parse(run.startedAt ?? run.queuedAt);
      if (elapsed > run.maxRuntimeMinutes * 60_000) {
        await cli.stop(run.appId!);
        await patchIfStatus(run.id, "running", current => transition(current, "stopped", {
          finishedAt: now().toISOString(), error: `Stopped at the max runtime cap of ${run.maxRuntimeMinutes} min.`,
        }));
      }
      return;
    }
    await finish(run, cli);
  }

  let polling: Promise<void> | undefined;
  let again = false;
  function poll(): Promise<void> {
    if (polling) {
      again = true;
      return polling;
    }
    polling = (async () => {
      do {
        again = false;
        const open = (await list()).filter(run => !isFinished(run.status));
        if (!open.length) continue;
        const { cli } = await deps.cli();
        const apps = await cli.listApps();
        for (const run of open) {
          await reconcile(run, apps, cli).catch(error => console.error(`[run-desk] reconcile ${run.id}:`, error));
        }
      } while (again);
    })().finally(() => { polling = undefined; });
    return polling;
  }

  async function stop(id: string): Promise<Run> {
    const run = await get(id);
    if (isFinished(run.status)) return run;
    if (run.appId) await (await deps.cli()).cli.stop(run.appId);
    return (await patchIfStatus(id, run.status, current => transition(current, "stopped", { finishedAt: now().toISOString(), error: "Stopped by you." }))) ?? get(id);
  }

  async function logs(id: string): Promise<string> {
    const run = await get(id);
    if (isFinished(run.status)) {
      const saved = await readFile(modalLog(id), "utf8").catch(() => undefined);
      if (saved !== undefined) return saved;
    }
    return tail(await readLogs(run, (await deps.cli()).cli));
  }

  return { list, get, launch, poll, stop, logs };
}

export type RunDesk = ReturnType<typeof createRunDesk>;
