import { execFile, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export interface ModalApp {
  appId: string;
  description: string;
  state: string;
}

export interface LaunchRequest {
  appName: string;
  script: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  logFile: string;
  onExit: (code: number | null) => void;
}

/** Everything Run Desk asks of Modal. Tests and the live lanes swap in a fake CLI binary. */
export interface ModalCli {
  launchArgs(appName: string, script: string, args: string[]): string[];
  launch(request: LaunchRequest): Promise<{ appId: string }>;
  listApps(): Promise<ModalApp[]>;
  logs(appId: string): Promise<string>;
  stop(appId: string): Promise<void>;
}

const APP_ID = /\bap-[A-Za-z0-9]{22}\b/;
const LAUNCH_TIMEOUT_MS = 120_000;

function run(program: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(program, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${[program, ...args].join(" ")} failed: ${(stderr || error.message).trim().slice(-500)}`));
      else resolve(stdout);
    });
  });
}

export function parseAppList(stdout: string): ModalApp[] {
  const rows: unknown = JSON.parse(stdout);
  if (!Array.isArray(rows)) throw new Error("modal app list --json did not return a list.");
  return rows.flatMap(row => {
    const item = row as Record<string, unknown>;
    return typeof item.app_id === "string"
      ? [{ appId: item.app_id, description: String(item.description ?? ""), state: String(item.state ?? "") }]
      : [];
  });
}

/** Modal labels a finished ephemeral app "stopped"; "stopping..." is still winding down. */
export const isStoppedState = (state: string) => state === "stopped";

export function modalCli(program: string): ModalCli {
  const launchArgs = (appName: string, script: string, args: string[]) => ["run", "--detach", "--name", appName, script, ...args];
  return {
    launchArgs,
    async launch({ appName, script, args, cwd, env, logFile, onExit }) {
      // The child writes straight to a file so it outlives this server; `--detach` keeps the app alive regardless.
      const fd = openSync(logFile, "a");
      let exited: number | null | undefined;
      let launchError: Error | undefined;
      try {
        const child = spawn(program, launchArgs(appName, script, args), {
          cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", fd, fd],
        });
        child.on("error", error => { launchError = error; });
        child.on("exit", code => { exited = code; onExit(code); });
        child.unref();
      } finally {
        closeSync(fd);
      }
      const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const appId = (await readFile(logFile, "utf8").catch(() => "")).match(APP_ID)?.[0];
        if (appId) return { appId };
        if (launchError) throw new Error(`Could not start ${program}: ${launchError.message}`);
        if (exited !== undefined) throw new Error(`modal run exited with code ${exited} before Modal reported an app id.`);
        await delay(250);
      }
      throw new Error(`Modal did not report an app id within ${LAUNCH_TIMEOUT_MS / 1000} s.`);
    },
    async listApps() {
      return parseAppList(await run(program, ["app", "list", "--json"]));
    },
    async logs(appId) {
      return run(program, ["app", "logs", appId, "--tail", "1000"]);
    },
    async stop(appId) {
      await run(program, ["app", "stop", "--yes", appId]);
    },
  };
}
