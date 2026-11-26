import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { emptyLedger, reduce, type DraftEvent, type LedgerEvent, type LedgerState } from "./domain.ts";

/** The append-only ledger log. One instance per backend owns the file; every change runs
 * through `transact`, which decides against the current state and appends under one lock. */
export class LedgerStore {
  private state: LedgerState | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly file: string, private readonly now: () => Date = () => new Date()) {}

  read(): Promise<LedgerState> {
    return this.serialize(() => this.load());
  }

  transact(decide: (state: LedgerState) => DraftEvent[]): Promise<{ state: LedgerState; appended: LedgerEvent[] }> {
    return this.serialize(async () => {
      let state = await this.load();
      const drafts = decide(state);
      if (!drafts.length) return { state, appended: [] };
      const at = this.now().toISOString();
      const appended = drafts.map(draft => ({ ...draft, id: randomUUID(), at }) as LedgerEvent);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      // One write with O_APPEND; a crash can tear only the final line, which load() repairs.
      await fs.appendFile(this.file, appended.map(event => JSON.stringify(event) + "\n").join(""));
      for (const event of appended) state = reduce(state, event);
      this.state = state;
      return { state, appended };
    });
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<LedgerState> {
    if (this.state) return this.state;
    let text: string;
    try { text = await fs.readFile(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return (this.state = emptyLedger());
    }
    const complete = text.lastIndexOf("\n") + 1;
    if (complete < text.length) await fs.truncate(this.file, Buffer.byteLength(text.slice(0, complete)));
    let state = emptyLedger();
    for (const line of text.slice(0, complete).split("\n")) {
      if (line.trim()) state = reduce(state, JSON.parse(line) as LedgerEvent);
    }
    return (this.state = state);
  }
}
