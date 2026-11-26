import type { PluginFrontendContext } from "learnharness-plugin-api";
import type { ScanReport } from "../evidence.ts";
import type { EntryRow, LedgerSnapshot } from "../projection.ts";
import type { SyncReport } from "../vault.ts";
import { attempt, buttons, h, stagePills, statusLine } from "./dom.ts";

export type Snapshot = LedgerSnapshot & { scan?: ScanReport };
export interface Navigation { openEntry(id: string): void }

const STATE_FILTERS = ["any", "open", "linked", "done", "reopened", "failed"] as const;

function groupOf(row: EntryRow): string {
  if (row.entry.kind === "paper") return row.entry.lineage ?? "Papers";
  if (row.entry.kind === "framework") return "Frameworks";
  return "Own work";
}

export async function mountLedgerView(ctx: PluginFrontendContext, nav: Navigation, container: HTMLElement, signal: AbortSignal): Promise<() => void> {
  const button = buttons(ctx, signal);
  const status = statusLine();
  const toolbar = h("div", { class: "lh-harness-toolbar" });
  const kind = h("select", { "aria-label": "Kind" }, ...["all", "paper", "framework", "own"].map(k => h("option", { value: k }, k === "all" ? "All kinds" : k === "own" ? "Own work" : `${k[0]!.toUpperCase()}${k.slice(1)}s`)));
  const state = h("select", { "aria-label": "Stage state" }, ...STATE_FILTERS.map(s => h("option", { value: s }, s === "any" ? "Any state" : `Has ${s}`)));
  const query = h("input", { type: "search", placeholder: "Filter by title or id", "aria-label": "Filter" });
  const filters = h("div", { class: "lh-harness-filters" }, kind, state, query);
  const list = h("div", { class: "lh-harness-ledger" });
  const problems = h("div", { class: "lh-harness-problems" });
  const root = h("div", { class: "lh-harness-view" }, toolbar, status.node, filters, list, problems);
  container.append(root);

  let snapshot: Snapshot | undefined;
  let generation = 0;
  const refresh = async () => {
    const mine = ++generation;
    const next = await ctx.call<Snapshot>("snapshot");
    if (signal.aborted || mine !== generation) return;
    snapshot = next;
    render();
  };

  const matches = (row: EntryRow) => {
    if (kind.value !== "all" && row.entry.kind !== kind.value) return false;
    if (state.value !== "any" && !Object.values(row.stages).some(s => s.state === state.value)) return false;
    const text = query.value.trim().toLowerCase();
    return !text || row.entry.title.toLowerCase().includes(text) || row.entry.id.includes(text);
  };

  function render() {
    if (!snapshot) return;
    const rows = snapshot.entries.filter(matches);
    const groups = new Map<string, EntryRow[]>();
    for (const row of rows) groups.set(groupOf(row), [...(groups.get(groupOf(row)) ?? []), row]);
    list.replaceChildren(
      ...(snapshot.entries.length ? [] : [h("p", { class: "lh-harness-empty" }, "The Stage ledger is empty. Seed it with the roadmap, or add material from the Material Desk.")]),
      ...[...groups].map(([group, members]) => h("section", { class: "lh-harness-group" },
        h("h3", {}, group),
        ...members.map(row => {
          const item = h("button", { class: "lh-harness-row", type: "button", "data-entry": row.entry.id, style: row.entry.parentId ? "padding-left: 1.5rem" : undefined },
            h("span", { class: "lh-harness-row__title" }, row.entry.title),
            h("code", { class: "lh-harness-row__id" }, row.entry.id),
            stagePills(row.stages));
          item.addEventListener("click", () => nav.openEntry(row.entry.id));
          return item;
        }))),
    );
    const scan = snapshot.scan;
    problems.replaceChildren(
      ...(snapshot.rejected.length ? [h("section", { class: "lh-harness-rejected" },
        h("h3", {}, `Rejected Evidence files (${snapshot.rejected.length})`),
        ...snapshot.rejected.map(r => h("div", { class: "lh-harness-rejection" }, h("code", {}, r.file), h("ul", {}, ...r.errors.map(e => h("li", {}, e))))))] : []),
      ...(snapshot.orphans.length ? [h("section", {}, h("h3", {}, "Evidence for entries not in the ledger"),
        h("ul", {}, ...snapshot.orphans.map(o => h("li", {}, h("code", {}, o.entryId), ` (${o.files.length} file${o.files.length === 1 ? "" : "s"})`))))] : []),
      ...(scan ? [h("section", { class: "lh-harness-roots" }, h("h3", {}, "Evidence roots"),
        h("ul", {}, ...scan.roots.map(r => h("li", {}, h("code", {}, r.directory), r.found ? ` ${r.files} file${r.files === 1 ? "" : "s"}` : " not found"))))] : []),
    );
  }

  for (const input of [kind, state]) input.addEventListener("change", render);
  query.addEventListener("input", render);

  button(toolbar, { label: "Seed roadmap", variant: "outline", onClick: async () => { await attempt(status, () => ctx.call<{ created: number }>("seed"), r => r.created ? `Seeded ${r.created} entries.` : "Every roadmap entry is already in the ledger."); await refresh(); } });
  button(toolbar, { label: "Rescan evidence", variant: "outline", onClick: async () => { await attempt(status, () => ctx.call<ScanReport>("rescan"), r => `Scan done: ${r.accepted} accepted, ${r.rejected} rejected.`); await refresh(); } });
  button(toolbar, { label: "Sync vault", variant: "outline", onClick: async () => {
    await attempt(status, () => ctx.call<SyncReport>("syncVault"), r => `Vault synced: ${r.written.length} written, ${r.unchanged} unchanged, ${r.deleted.length} deleted${r.kept.length ? `, ${r.kept.length} left alone (edited or not ours)` : ""}.`);
  } });

  const unsubscribe = ctx.onNotification(event => { if (event.topic === "ledger") void refresh(); });
  const unresync = ctx.onResync(() => void refresh());
  await refresh();
  void attempt(status, () => ctx.call<ScanReport>("rescan")).then(() => { if (!signal.aborted) return refresh(); });
  return () => { generation++; unsubscribe(); unresync(); root.remove(); };
}
