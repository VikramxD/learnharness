import { readFileSync } from "node:fs";
import path from "node:path";
import type { PluginLearningData } from "learnharness-plugin-api";
import { createEntries } from "./domain.ts";
import { scanEvidence, type ScanReport } from "./evidence.ts";
import { ledgerSnapshot, type LedgerSnapshot } from "./projection.ts";
import { seedEntries, type Roadmap } from "./seed.ts";
import { parseSettingsInput, readSettings, writeSettings, type HarnessSettings } from "./settings.ts";
import { LedgerStore } from "./store.ts";

export const LEDGER_TOPIC = "ledger";

export interface HarnessDeps {
  /** The plugin's code directory, holding seed/roadmap.json. */
  directory: string;
  dataDirectory: string;
  learning: PluginLearningData;
  /** Tell open views the ledger changed. */
  notify: (topic: string) => void;
}

export function createHarness(deps: HarnessDeps) {
  const store = new LedgerStore(path.join(deps.dataDirectory, "ledger.jsonl"));
  const settings = () => readSettings(deps.dataDirectory, deps.learning.directory);
  let lastScan: ScanReport | undefined;
  const seed = seedEntries(JSON.parse(readFileSync(path.join(deps.directory, "seed", "roadmap.json"), "utf8")) as Roadmap);
  const questions = new Map(seed.map(s => [s.entry.id as string, s.question]));

  const rescan = async (): Promise<ScanReport> => {
    lastScan = await scanEvidence(store, (await settings()).evidenceRoots);
    if (lastScan.accepted + lastScan.rejected) deps.notify(LEDGER_TOPIC);
    return lastScan;
  };

  const operations = {
    async snapshot(): Promise<LedgerSnapshot & { scan?: ScanReport }> {
      return { ...ledgerSnapshot(await store.read()), scan: lastScan };
    },
    rescan,
    async seed(): Promise<{ created: number }> {
      const { appended } = await store.transact(state => createEntries(state, seed.map(s => s.entry)));
      if (appended.length) deps.notify(LEDGER_TOPIC);
      return { created: appended.length };
    },
    getSettings: settings,
    async saveSettings(input: unknown): Promise<HarnessSettings> {
      const next = parseSettingsInput(input, await settings());
      await writeSettings(deps.dataDirectory, next);
      return next;
    },
  } satisfies Record<string, (input: unknown) => unknown>;

  return { store, operations, rescan, questions };
}

export type Harness = ReturnType<typeof createHarness>;
