import type { PluginFrontendContext } from "learnharness-plugin-api";
import type { Settings } from "./backend.ts";
import { h } from "./dom.ts";
import { mountDeskView, type DeskStatus } from "./view.ts";

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>';

async function mountSettings(ctx: PluginFrontendContext, container: HTMLElement, signal: AbortSignal): Promise<() => void> {
  const rowsRoot = h("div");
  const status = h("p", { class: "rd-muted", role: "status" });
  const root = h("div", { class: "rd-root rd-settings" }, rowsRoot, status);
  container.append(root);
  const showStatus = async () => {
    const result = await ctx.call<DeskStatus>("status");
    if (signal.aborted) return;
    status.textContent = `${result.modalFound ? "Modal CLI found." : `No executable at ${result.modalPath}.`} ${result.wandbConfigured ? "W&B key found in ~/.netrc." : result.wandbNotice}`;
  };
  let current = await ctx.call<Settings>("getSettings");
  if (signal.aborted) { root.remove(); return () => {}; }
  const schema = () => ({
    rows: [{
      type: "text" as const, key: "modalPath", label: "Modal CLI path",
      description: "Run Desk runs this binary for `modal run --detach`, `modal app list`, `modal app logs` and `modal app stop`. It never reads your Modal token.",
      value: current.modalPath,
      validate: (value: string) => (value.trim().startsWith("/") ? undefined : "Use an absolute path."),
      onChange: async (value: string) => {
        current = await ctx.call<Settings>("saveSettings", { modalPath: value });
        if (signal.aborted) return;
        rows.update(schema());
        await showStatus();
      },
    }],
  });
  const rows = ctx.ui.mountSettingsRows(rowsRoot, schema(), { signal });
  void showStatus();
  return () => { rows.dispose(); root.remove(); };
}

export function activate(ctx: PluginFrontendContext): () => void {
  const unregister = [
    ctx.registerView({ id: "desk", name: "Run Desk", mount: (container, signal) => mountDeskView(ctx, container, signal) }),
    ctx.registerSettings((container, signal) => mountSettings(ctx, container, signal)),
    ctx.registerAction({ id: "open-desk", name: "Run Desk", icon: ICON, run: () => ctx.app.openView("desk") }),
    ctx.placeAction({ id: "desk-sidebar", actionId: "open-desk", location: "sidebar" }),
  ];
  return () => { for (const dispose of unregister.reverse()) dispose(); };
}
