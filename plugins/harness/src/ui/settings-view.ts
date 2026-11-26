import type { PluginFrontendContext, PluginSettingsSchema } from "learnharness-plugin-api";
import type { HarnessSettings } from "../settings.ts";
import { attempt, h, statusLine } from "./dom.ts";

const absolute = (value: string) => (value.trim().startsWith("/") || value.trim().startsWith("~/") ? undefined : "Use an absolute path.");
const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);

export async function mountSettingsView(ctx: PluginFrontendContext, container: HTMLElement, signal: AbortSignal): Promise<() => void> {
  let current = await ctx.call<HarnessSettings>("getSettings");
  const status = statusLine();
  const rowsRoot = h("div");
  const roots = h("textarea", { rows: "4", "aria-label": "Evidence roots", class: "lh-harness-roots-input" });
  roots.value = current.evidenceRoots.join("\n");
  const rootsActions = h("div", { class: "lh-harness-actions" });
  const root = h("div", { class: "lh-harness-settings" }, rowsRoot,
    h("label", { class: "lh-harness-field" }, h("span", {}, "Evidence roots, one absolute path per line. A repo root is scanned under its evidence/ folder; Run Desk's evidence folder is scanned as is."), roots),
    rootsActions, status.node);
  container.append(root);
  if (signal.aborted) { root.remove(); return () => {}; }

  const save = async (change: Partial<HarnessSettings>) => {
    current = await ctx.call<HarnessSettings>("saveSettings", change);
    if (!signal.aborted) rows.update(schema());
  };
  const schema = (): PluginSettingsSchema => ({
    rows: [
      { type: "text", key: "vaultPath", label: "Vault path", description: "Harness writes only under <vault>/LearnHarness/.", value: current.vaultPath, validate: absolute, onChange: value => save({ vaultPath: value }) },
      { type: "toggle", key: "autoSync", label: "Sync vault after every ledger change", description: "Turns on when you set the vault path or press Sync vault. Writes only under <vault>/LearnHarness/.", value: current.autoSync, onChange: value => save({ autoSync: value }) },
      { type: "text", key: "feedKeywords", label: "Feed keywords", description: "Comma-separated words for the Material Desk's new-paper feed.", value: current.feedKeywords.join(", "), onChange: value => save({ feedKeywords: value.split(",") }) },
    ],
  });
  const rows = ctx.ui.mountSettingsRows(rowsRoot, schema(), { signal });
  const saveRoots = ctx.ui.mountButton(rootsActions, {
    label: "Save evidence roots", variant: "outline",
    onClick: async () => {
      const saved = await attempt(status, () => ctx.call<HarnessSettings>("saveSettings", { evidenceRoots: lines(roots.value) }), s => `Saved ${s.evidenceRoots.length} evidence roots.`);
      if (saved) { current = saved; roots.value = saved.evidenceRoots.join("\n"); }
    },
  }, { signal });
  return () => { rows.dispose(); saveRoots.dispose(); root.remove(); };
}
