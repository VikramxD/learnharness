import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

export const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
export const repoRoot = path.resolve(pluginRoot, "../..");

export async function tempDirectory(t: TestContext, prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
