import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface JsonFile<T> {
  read(): Promise<T>;
  /** Serialized read-modify-write, so the poller and handlers never drop each other's changes. */
  update(change: (current: T) => T | Promise<T>): Promise<T>;
}

export function jsonFile<T>(file: string, empty: () => T): JsonFile<T> {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<T> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw error;
    }
  };
  return {
    read,
    update(change) {
      const next = queue.then(async () => {
        const value = await change(await read());
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
        await rename(temporary, file);
        return value;
      });
      queue = next.catch(() => {});
      return next;
    },
  };
}
