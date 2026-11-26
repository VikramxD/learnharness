import type { PluginFrontendContext } from "learnharness-plugin-api";
import { mountDeskView } from "./ui/desk-view.ts";
import { mountEntryView } from "./ui/entry-view.ts";
import { mountLedgerView, type Navigation } from "./ui/ledger-view.ts";
import { mountSettingsView } from "./ui/settings-view.ts";

const LEDGER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><circle cx="8" cy="5" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>';
const SELECTED_KEY = "harness:selected-entry";

const readSelected = () => { try { return localStorage.getItem(SELECTED_KEY) ?? undefined; } catch { return undefined; } };

export function activate(ctx: PluginFrontendContext): () => void {
  let selected = readSelected();
  const nav: Navigation = {
    openEntry(id) {
      selected = id;
      try { localStorage.setItem(SELECTED_KEY, id); } catch {}
      void ctx.app.openView("entry");
    },
  };

  const unregister = [
    ctx.registerView({ id: "ledger", name: "Stage ledger", mount: (container, signal) => mountLedgerView(ctx, nav, container, signal) }),
    ctx.registerView({ id: "entry", name: "Entry", mount: (container, signal) => mountEntryView(ctx, selected, container, signal) }),
    ctx.registerView({ id: "desk", name: "Material Desk", mount: (container, signal) => mountDeskView(ctx, nav, container, signal) }),
    ctx.registerSettings((container, signal) => mountSettingsView(ctx, container, signal)),
    ctx.registerAction({ id: "open-ledger", name: "Harness", icon: LEDGER_ICON, run: () => ctx.app.openView("ledger") }),
    ctx.registerAction({ id: "open-ledger-back", name: "Stage ledger", run: () => ctx.app.openView("ledger") }),
    ctx.registerAction({ id: "open-desk", name: "Material Desk", run: () => ctx.app.openView("desk") }),
    ctx.registerAction({ id: "rescan", name: "Rescan evidence", run: async () => { await ctx.call("rescan"); } }),
    ctx.placeAction({ id: "ledger-sidebar", actionId: "open-ledger", location: "sidebar" }),
    ctx.placeAction({ id: "desk-top-bar", actionId: "open-desk", location: "top-bar", views: ["ledger", "entry"] }),
    ctx.placeAction({ id: "ledger-top-bar", actionId: "open-ledger-back", location: "top-bar", views: ["entry", "desk"] }),
    ctx.placeAction({ id: "rescan-top-bar", actionId: "rescan", location: "top-bar", views: ["ledger"] }),
  ];
  return () => { for (const dispose of unregister.reverse()) dispose(); };
}
