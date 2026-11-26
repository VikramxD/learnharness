import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFileAtomic } from "./files.ts";

export interface HarnessSettings {
  vaultPath: string;
  evidenceRoots: string[];
  feedKeywords: string[];
  autoSync: boolean;
}

export function defaultSettings(learningDirectory: string): HarnessSettings {
  return {
    vaultPath: path.join(os.homedir(), "Documents", "vikramxd-vault"),
    evidenceRoots: [path.join(learningDirectory, "plugins", "run-desk", "data", "evidence")],
    feedKeywords: ["diffusion", "flow matching", "video generation", "world model", "GRPO", "DPO", "reward model"],
    autoSync: false,
  };
}

const settingsFile = (dataDirectory: string) => path.join(dataDirectory, "settings.json");

export async function readSettings(dataDirectory: string, learningDirectory: string): Promise<HarnessSettings> {
  const defaults = defaultSettings(learningDirectory);
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile(dataDirectory), "utf8")) as Partial<HarnessSettings>;
    return { ...defaults, ...saved };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults;
    throw error;
  }
}

const expandHome = (value: string) => (value === "~" || value.startsWith("~/") ? path.join(os.homedir(), value.slice(1)) : value);

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a path.`);
  const expanded = expandHome(value.trim());
  if (!path.isAbsolute(expanded)) throw new Error(`${label} must be an absolute path: ${value}`);
  return path.normalize(expanded);
}

export function parseSettingsInput(input: unknown, current: HarnessSettings): HarnessSettings {
  if (typeof input !== "object" || input === null) throw new Error("Settings must be an object.");
  const change = input as Record<string, unknown>;
  const next = { ...current };
  if ("vaultPath" in change) {
    next.vaultPath = absolutePath(change.vaultPath, "Vault path");
    next.autoSync = true;
  }
  if ("autoSync" in change) {
    if (typeof change.autoSync !== "boolean") throw new Error("Auto sync must be true or false.");
    next.autoSync = change.autoSync;
  }
  if ("evidenceRoots" in change) {
    if (!Array.isArray(change.evidenceRoots)) throw new Error("Evidence roots must be a list of paths.");
    next.evidenceRoots = [...new Set(change.evidenceRoots.map(root => absolutePath(root, "Evidence root")))];
  }
  if ("feedKeywords" in change) {
    if (!Array.isArray(change.feedKeywords) || !change.feedKeywords.every(k => typeof k === "string")) throw new Error("Feed keywords must be a list of words.");
    next.feedKeywords = [...new Set((change.feedKeywords as string[]).map(k => k.trim()).filter(Boolean))];
  }
  return next;
}

export async function writeSettings(dataDirectory: string, settings: HarnessSettings): Promise<void> {
  await writeFileAtomic(settingsFile(dataDirectory), JSON.stringify(settings, null, 2) + "\n");
}
