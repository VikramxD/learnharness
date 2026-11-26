import { promises as fs } from "node:fs";
import path from "node:path";
import { parseSettings, type Settings } from "./model.ts";

const file = (dataDirectory: string) => path.join(dataDirectory, "settings.json");

export async function readSettings(dataDirectory: string): Promise<Settings> {
  try {
    return parseSettings(JSON.parse(await fs.readFile(file(dataDirectory), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return parseSettings({});
    throw error;
  }
}

export async function writeSettings(dataDirectory: string, input: unknown): Promise<Settings> {
  const settings = parseSettings(input);
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporary = `${file(dataDirectory)}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(settings, null, 2) + "\n");
  await fs.rename(temporary, file(dataDirectory));
  return settings;
}
