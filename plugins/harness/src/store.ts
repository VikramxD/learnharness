import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { serialized } from "./files.ts";
import { emptyLedger, reduce, type DraftEvent, type LedgerEvent, type LedgerState } from "./domain.ts";

export class LedgerStore {
  private state: LedgerState | undefined;
  private readonly serialize = serialized();

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
      await fs.appendFile(this.file, appended.map(event => JSON.stringify(event) + "\n").join(""));
      for (const event of appended) state = reduce(state, event);
      this.state = state;
      return { state, appended };
    });
  }

  private async load(): Promise<LedgerState> {
    if (this.state) return this.state;
    let text: string;
    try { text = await fs.readFile(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return (this.state = emptyLedger());
    }
    let state = emptyLedger();
    for (const line of (await this.repairTornTail(text)).split("\n")) {
      if (line.trim()) state = reduce(state, JSON.parse(line) as LedgerEvent);
    }
    return (this.state = state);
  }

  /** A crash mid-append can leave a final line without its newline; drop it so later appends stay line-aligned. */
  private async repairTornTail(text: string): Promise<string> {
    const complete = text.slice(0, text.lastIndexOf("\n") + 1);
    if (complete.length < text.length) await fs.truncate(this.file, Buffer.byteLength(complete));
    return complete;
  }
}
