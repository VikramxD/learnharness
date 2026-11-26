import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { Template } from "../src/model.ts";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function tempDirectory(t: TestContext, prefix = "run-desk-"): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** A private copy of the fake Modal CLI, with its own app state and call log. */
export function installFakeModal(directory: string): { program: string; calls: () => string[][] } {
  const program = path.join(directory, "fake-modal.mjs");
  copyFileSync(path.join(testsDirectory, "fake-modal.mjs"), program);
  chmodSync(program, 0o755);
  const log = path.join(directory, "fake-modal-calls.log");
  return {
    program,
    calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]) : []),
  };
}

/** A git repo holding a Python script that the fake CLI runs as the remote job. */
export function scriptRepo(directory: string, body: string): { script: string; commit: string } {
  const repo = path.join(directory, "repo");
  mkdirSync(repo, { recursive: true });
  const script = path.join(repo, "job.py");
  writeFileSync(script, body);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  git("add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "job");
  return { script, commit: git("rev-parse", "HEAD") };
}

export const optimizeLine = (fields: Record<string, unknown> = {}) => `print("LH_EVIDENCE " + ${JSON.stringify(JSON.stringify({
  outcome: "pass", metric: "step time", unit: "ms", better: "lower", baseline: 41.8, result: 33.5, hardware: "1x NVIDIA L4", why: "Fused the norm.", ...fields,
}))})`;

export function template(script: string, overrides: Partial<Template> = {}): Template {
  return {
    id: "t1", name: "rmsnorm bench", entryId: "framework.sglang.rmsnorm-kernel", stage: "optimize",
    script, args: ["--shape", "4096x8192"], gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 30, ...overrides,
  };
}

export async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out; last value ${JSON.stringify(value)}`);
    await delay(100);
  }
}
