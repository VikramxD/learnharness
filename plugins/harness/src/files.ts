import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";

export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Write through a hidden temporary sibling and rename, so readers never see a partial file. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

export async function readDirectories(directory: string): Promise<string[]> {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return [];
    throw error;
  }
}
