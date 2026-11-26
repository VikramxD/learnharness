import type { PluginBackendContext } from "learnharness-plugin-api";
import { createHarness } from "./service.ts";
import { harnessTools, INSTRUCTIONS, TOOL_AGENTS } from "./tools.ts";

const RESCAN_INTERVAL_MS = 2 * 60 * 1000;

export function activate(ctx: PluginBackendContext): () => void {
  const harness = createHarness({
    directory: ctx.directory,
    dataDirectory: ctx.dataDirectory,
    learning: ctx.learning,
    notify: topic => { if (!ctx.signal.aborted) ctx.events.emit(topic, {}); },
  });
  const unregister = [
    ...Object.entries(harness.operations).map(([name, run]) => ctx.handle(name, input => run(input as never))),
    ctx.registerInstructions({ agents: TOOL_AGENTS, text: INSTRUCTIONS }),
    ctx.registerTools({ agents: TOOL_AGENTS, create: () => harnessTools(harness) }),
  ];
  const rescanQuietly = () => harness.rescan().catch(error => console.error("[harness] evidence scan failed:", error));
  void rescanQuietly();
  const timer = setInterval(rescanQuietly, RESCAN_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    for (const dispose of unregister.reverse()) dispose();
  };
}
