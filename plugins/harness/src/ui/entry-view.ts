import type { PluginFrontendContext } from "learnharness-plugin-api";
import type { BuildStage } from "../domain.ts";
import type { EntryRow } from "../projection.ts";
import type { LinkedSession, SessionSummary, SuggestedSession } from "../sessions.ts";
import { evidenceSummary } from "../evidence-text.ts";
import { attempt, buttons, h, stagePills, statusLine } from "./dom.ts";
import type { Snapshot } from "./ledger-view.ts";

interface SessionsView { linked: LinkedSession[]; suggested: SuggestedSession[]; chainIds: string[]; canMarkUnderstood: boolean }
interface LocalPaths { pdfPath?: string; checkoutPath?: string; vaultNotePath?: string; missing?: string }

export async function mountEntryView(ctx: PluginFrontendContext, entryId: string | undefined, container: HTMLElement, signal: AbortSignal): Promise<() => void> {
  const button = buttons(ctx, signal);
  const status = statusLine();
  const body = h("div");
  const root = h("div", { class: "lh-harness-view" }, status.node, body);
  container.append(root);
  if (!entryId) {
    body.append(h("p", { class: "lh-harness-empty" }, "Pick an entry in the Stage ledger."));
    return () => root.remove();
  }

  let generation = 0;
  const refresh = async () => {
    const mine = ++generation;
    const [snapshot, sessions, paths, all] = await Promise.all([
      ctx.call<Snapshot>("snapshot"),
      ctx.call<SessionsView>("entrySessions", { entryId }),
      ctx.call<LocalPaths>("localPaths", { entryId }),
      ctx.call<SessionSummary[]>("listSessions"),
    ]);
    if (signal.aborted || mine !== generation) return;
    const row = snapshot.entries.find(r => r.entry.id === entryId);
    if (!row) { body.replaceChildren(h("p", { class: "lh-harness-empty" }, `${entryId} is not in the Stage ledger.`)); return; }
    render(row, sessions, paths, all);
  };

  const act = (work: () => Promise<unknown>, done: string) => async () => { if (await attempt(status, work, () => done) !== undefined) await refresh(); };

  function render(row: EntryRow, sessions: SessionsView, paths: LocalPaths, all: SessionSummary[]) {
    const { entry, stages } = row;
    const source = entry.source;
    const sourceList = h("ul", { class: "lh-harness-sources" });
    const sourceActions = h("div", { class: "lh-harness-actions" });
    if (source.kind === "paper") {
      sourceList.append(h("li", {}, "arXiv ", h("a", { href: `https://arxiv.org/abs/${source.arxivId}`, target: "_blank", rel: "noopener noreferrer" }, source.arxivId)));
      sourceList.append(h("li", {}, paths.pdfPath ? h("code", {}, paths.pdfPath) : "PDF not downloaded"));
      if (!paths.pdfPath) button(sourceActions, { label: "Download PDF", variant: "outline", onClick: act(() => ctx.call("fetchPdf", { entryId }), "PDF downloaded.") });
    } else if (source.kind === "framework") {
      sourceList.append(h("li", {}, `${source.repoUrl} at `, h("code", {}, source.commit)));
      sourceList.append(h("li", {}, paths.checkoutPath ? h("code", {}, paths.checkoutPath) : "Not checked out"));
      if (!paths.checkoutPath) button(sourceActions, { label: "Check out", variant: "outline", onClick: act(() => ctx.call("checkoutEntry", { entryId }), "Checked out read-only.") });
    } else {
      sourceList.append(h("li", {}, h("code", {}, source.vaultNotePath)));
    }

    const linked = h("ul", { class: "lh-harness-sessions" });
    for (const s of sessions.linked) {
      const li = h("li", {}, h("span", {}, s.title), h("span", { class: "lh-harness-muted" }, ` ${s.chains} chain${s.chains === 1 ? "" : "s"} in the graph `));
      button(li, { label: "Open session", size: "sm", variant: "outline", onClick: () => ctx.app.openSession(s.id) });
      button(li, { label: "Unlink", size: "sm", variant: "ghost", onClick: act(() => ctx.call("unlinkSession", { entryId, chatId: s.id }), "Session unlinked.") });
      linked.append(li);
    }
    if (!sessions.linked.length) linked.append(h("li", { class: "lh-harness-muted" }, "No linked sessions."));

    const suggested = h("ul", { class: "lh-harness-sessions" });
    for (const s of sessions.suggested) {
      const li = h("li", {}, h("span", {}, s.title), h("span", { class: "lh-harness-muted" }, ` mentions ${s.mentions.join(", ")} `));
      button(li, { label: "Link", size: "sm", variant: "outline", onClick: act(() => ctx.call("linkSession", { entryId, chatId: s.id }), "Session linked.") });
      suggested.append(li);
    }

    const picker = h("select", { "aria-label": "Session to link" }, h("option", { value: "" }, "Link a session…"),
      ...all.filter(s => !row.chatIds.includes(s.id)).map(s => h("option", { value: s.id }, `${s.title} (${s.kind})`)));
    picker.addEventListener("change", () => { if (picker.value) void act(() => ctx.call("linkSession", { entryId, chatId: picker.value }), "Session linked.")(); });

    const understandActions = h("div", { class: "lh-harness-actions" });
    button(understandActions, {
      label: "Mark understood", disabled: !sessions.canMarkUnderstood,
      title: sessions.canMarkUnderstood ? `Records ${sessions.chainIds.length} reasoning chains from linked sessions.` : "Needs a linked session with reasoning chains in the graph.",
      onClick: act(() => ctx.call("markUnderstood", { entryId }), "Marked understood."),
    });
    button(understandActions, {
      label: "Copy teaching goal", variant: "outline",
      onClick: async () => {
        await attempt(status, async () => {
          const { text } = await ctx.call<{ text: string }>("teachingGoal", { entryId });
          await navigator.clipboard.writeText(text);
          return text;
        }, () => "Teaching goal copied. Paste it into a new Teach session.");
      },
    });

    const evidence = h("table", { class: "lh-harness-evidence" },
      h("thead", {}, h("tr", {}, h("th", {}, "Stage"), h("th", {}, "Outcome"), h("th", {}, "Produced"), h("th", {}, "Result"), h("th", {}, "File"))),
      h("tbody", {}, ...row.evidenceNewestFirst.map(r => h("tr", {},
        h("td", {}, r.evidence.stage), h("td", { "data-outcome": r.evidence.outcome }, r.evidence.outcome), h("td", {}, r.evidence.producedAt),
        h("td", {}, evidenceSummary(r.evidence)), h("td", {}, h("code", {}, r.file))))));

    const handoffActions = h("div", { class: "lh-harness-actions" });
    button(handoffActions, { label: "Hand off to build", onClick: () => openHandoff(entry.title) });

    const understand = stages.understand;
    body.replaceChildren(
      h("header", { class: "lh-harness-entry__header" },
        h("h2", {}, entry.title),
        h("p", {}, h("code", {}, entry.id), entry.lineage ? ` · ${entry.lineage}` : "", entry.parentId ? ` · part of ${entry.parentId}` : ""),
        stagePills(stages)),
      ...(understand.state === "reopened" ? [h("p", { class: "lh-harness-gap" }, `Understand reopened by a ${understand.gap.stage} failure: gap in ${understand.gap.concept}. ${understand.gap.why}`)] : []),
      h("section", {}, h("h3", {}, "Sources"), sourceList, sourceActions),
      h("section", {}, h("h3", {}, "Understand"), h("h4", {}, "Linked sessions"), linked,
        ...(sessions.suggested.length ? [h("h4", {}, "Suggested sessions"), suggested] : []), picker, understandActions),
      h("section", {}, h("h3", {}, "Evidence history"), row.evidenceNewestFirst.length ? evidence : h("p", { class: "lh-harness-muted" }, "No Evidence files yet.")),
      h("section", {}, h("h3", {}, "Handoffs"),
        ...(row.handoffs.length ? [h("ul", {}, ...row.handoffs.map(p => h("li", {}, h("code", {}, p))))] : []), handoffActions),
    );
  }

  function openHandoff(title: string) {
    const field = (name: string, labelText: string, value = "") => {
      const input = h("input", { name, value, "aria-label": labelText });
      return { input, row: h("label", { class: "lh-harness-field" }, h("span", {}, labelText), input) };
    };
    const stage = h("select", { name: "stage", "aria-label": "Stage" }, ...(["implement", "optimize", "serve"] as BuildStage[]).map(s => h("option", { value: s }, s)));
    const fields = {
      topic: field("topic", "Topic", title),
      reference: field("reference", "Reference to match (implement)"),
      baseline: field("baseline", "Baseline to beat: what, metric, lower or higher is better (optimize)"),
      target: field("target", "Target (optional)"),
      repo: field("repo", "Repo path (optional)"),
      command: field("command", "Suggested command (optional)"),
    };
    const dialogStatus = statusLine();
    const actions = h("div", { class: "lh-harness-actions" });
    const form = h("div", { class: "lh-harness-dialog" }, h("h3", {}, "Hand off to build"),
      h("label", { class: "lh-harness-field" }, h("span", {}, "Stage"), stage), ...Object.values(fields).map(f => f.row), dialogStatus.node, actions);
    const dialog = ctx.ui.openDialog({ title: "Hand off to build", content: form }, { signal });
    ctx.ui.mountButton(actions, {
      label: "Write Handoff note",
      onClick: async () => {
        const input = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.input.value]));
        const result = await attempt(dialogStatus, () => ctx.call<{ notePath: string }>("handOff", { entryId, stage: stage.value, ...input }));
        if (!result) return;
        dialog.dispose();
        status.show(`Handoff written to ${result.notePath}`);
        await refresh();
      },
    }, { signal });
  }

  const unsubscribe = ctx.onNotification(event => { if (event.topic === "ledger") void refresh(); });
  await refresh();
  return () => { generation++; unsubscribe(); root.remove(); };
}
