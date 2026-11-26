import type { PluginBackendContext } from "learnharness-plugin-api";
import { createHarness } from "./service.ts";

const RESCAN_INTERVAL_MS = 2 * 60 * 1000;

export function activate(ctx: PluginBackendContext): () => void {
  const harness = createHarness({
    dataDirectory: ctx.dataDirectory,
    learning: ctx.learning,
    notify: topic => { if (!ctx.signal.aborted) ctx.events.emit(topic, {}); },
  });
  const unregister = Object.entries(harness.operations).map(([name, run]) => ctx.handle(name, input => run(input as never)));
  const rescanQuietly = () => harness.rescan().catch(error => console.error("[harness] evidence scan failed:", error));
  void rescanQuietly();
  const timer = setInterval(rescanQuietly, RESCAN_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    for (const dispose of unregister.reverse()) dispose();
  };
}
