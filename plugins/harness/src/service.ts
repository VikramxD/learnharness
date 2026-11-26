import path from "node:path";
import type { PluginLearningData } from "learnharness-plugin-api";
import { scanEvidence, type ScanReport } from "./evidence.ts";
import { ledgerSnapshot, type LedgerSnapshot } from "./projection.ts";
import { parseSettingsInput, readSettings, writeSettings, type HarnessSettings } from "./settings.ts";
import { LedgerStore } from "./store.ts";

export const LEDGER_TOPIC = "ledger";

export interface HarnessDeps {
  dataDirectory: string;
  learning: PluginLearningData;
  /** Tell open views the ledger changed. */
  notify: (topic: string) => void;
}

export function createHarness(deps: HarnessDeps) {
  const store = new LedgerStore(path.join(deps.dataDirectory, "ledger.jsonl"));
  const settings = () => readSettings(deps.dataDirectory, deps.learning.directory);
  let lastScan: ScanReport | undefined;

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
    getSettings: settings,
    async saveSettings(input: unknown): Promise<HarnessSettings> {
      const next = parseSettingsInput(input, await settings());
      await writeSettings(deps.dataDirectory, next);
      return next;
    },
  } satisfies Record<string, (input: unknown) => unknown>;

  return { store, operations, rescan };
}

export type Harness = ReturnType<typeof createHarness>;
