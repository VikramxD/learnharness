import type { PluginFrontendContext } from "learnharness-plugin-api";
import type { ArxivPaper } from "../arxiv.ts";
import type { AlphaxivResult, OwnWorkNote, Reference } from "../material.ts";
import { attempt, buttons, h, statusLine } from "./dom.ts";
import type { Navigation } from "./ledger-view.ts";

type Result = ArxivPaper & { inLedger: boolean };
interface Details { alphaxiv: AlphaxivResult; references: { ok: true; list: Reference[] } | { ok: false; error: string } }

export async function mountDeskView(ctx: PluginFrontendContext, nav: Navigation, container: HTMLElement, signal: AbortSignal): Promise<() => void> {
  const button = buttons(ctx, signal);
  const status = statusLine();

  const query = h("input", { type: "search", placeholder: "Search arXiv by words or id, such as diffusion forcing or 2407.01392", "aria-label": "Search arXiv" });
  const searchRow = h("div", { class: "lh-harness-toolbar" }, query);
  const results = h("div", { class: "lh-harness-results" });
  const feedRow = h("div", { class: "lh-harness-toolbar" });
  const feed = h("div", { class: "lh-harness-results" });

  const repoUrl = h("input", { placeholder: "https://github.com/sgl-project/sglang", "aria-label": "Repository URL" });
  const commit = h("input", { placeholder: "Full commit, branch or tag", "aria-label": "Commit" });
  const name = h("input", { placeholder: "Name (optional)", "aria-label": "Framework name" });
  const frameworkRow = h("div", { class: "lh-harness-toolbar" }, repoUrl, commit, name);
  const ownList = h("ul", { class: "lh-harness-own" });

  const root = h("div", { class: "lh-harness-view" }, status.node,
    h("section", {}, h("h3", {}, "Papers"), searchRow, results),
    h("section", {}, h("h3", {}, "New papers for your keywords"), feedRow, feed),
    h("section", {}, h("h3", {}, "Framework at a pinned commit"), frameworkRow),
    h("section", {}, h("h3", {}, "Own work from the vault"), ownList));
  container.append(root);

  const renderPapers = (target: HTMLElement, papers: Result[]) => {
    target.replaceChildren(...(papers.length ? [] : [h("p", { class: "lh-harness-muted" }, "No papers found.")]), ...papers.map(paper => {
      const details = h("div", { class: "lh-harness-details" });
      const actions = h("div", { class: "lh-harness-actions" });
      const card = h("article", { class: "lh-harness-paper", "data-arxiv": paper.id },
        h("h4", {}, paper.title),
        h("p", { class: "lh-harness-muted" }, `${paper.id} · ${paper.published.slice(0, 10)} · ${paper.authors.slice(0, 4).join(", ")}${paper.authors.length > 4 ? " et al." : ""}`),
        h("p", { class: "lh-harness-abstract" }, paper.abstract), actions, details);
      button(actions, {
        label: paper.inLedger ? "Open entry" : "Add paper",
        onClick: async () => {
          if (paper.inLedger) { nav.openEntry(`paper.${paper.id}`); return; }
          const added = await attempt(status, () => ctx.call<{ entryId: string; pdfPath: string }>("addPaper", { arxivId: paper.id }), r => `Added ${r.entryId}; PDF at ${r.pdfPath}`);
          if (added) nav.openEntry(added.entryId);
        },
      });
      button(actions, {
        label: "References and alphaXiv", variant: "outline",
        onClick: async () => {
          details.replaceChildren(h("p", { class: "lh-harness-muted" }, "Loading…"));
          const d = await attempt(status, () => ctx.call<Details>("paperDetails", { arxivId: paper.id }));
          if (!d || signal.aborted) { details.replaceChildren(); return; }
          details.replaceChildren(
            h("p", {}, d.alphaxiv.available ? `alphaXiv: ${d.alphaxiv.citations ?? "?"} citations · ` : `alphaXiv unavailable: ${d.alphaxiv.reason}`,
              d.alphaxiv.available ? h("a", { href: d.alphaxiv.url, target: "_blank", rel: "noopener noreferrer" }, "open") : ""),
            d.references.ok
              ? h("ul", {}, ...d.references.list.map(r => h("li", {}, r.title, r.year ? ` (${r.year})` : "", r.arxivId ? h("code", {}, ` ${r.arxivId}`) : "")))
              : h("p", { class: "lh-harness-muted" }, `References unavailable: ${d.references.error}`));
        },
      });
      return card;
    }));
  };

  let searchGeneration = 0;
  const search = async () => {
    const text = query.value.trim();
    if (!text) return;
    const mine = ++searchGeneration;
    results.replaceChildren(h("p", { class: "lh-harness-muted" }, "Searching arXiv…"));
    const papers = await attempt(status, () => ctx.call<Result[]>("search", { query: text }));
    if (signal.aborted || mine !== searchGeneration) return;
    renderPapers(results, papers ?? []);
  };
  query.addEventListener("keydown", event => { if (event.key === "Enter") void search(); });
  button(searchRow, { label: "Search", onClick: search });

  button(feedRow, {
    label: "Load feed", variant: "outline",
    onClick: async () => {
      feed.replaceChildren(h("p", { class: "lh-harness-muted" }, "Loading the newest cs.CV and cs.LG papers…"));
      const papers = await attempt(status, () => ctx.call<Result[]>("feed"));
      if (!signal.aborted) renderPapers(feed, papers ?? []);
    },
  });

  button(frameworkRow, {
    label: "Add framework",
    onClick: async () => {
      status.show("Checking out… a large repository can take a minute.");
      const added = await attempt(status, () => ctx.call<{ entryId: string; checkoutPath: string }>("addFramework", { repoUrl: repoUrl.value, commit: commit.value, name: name.value }), r => `Added ${r.entryId}; read-only checkout at ${r.checkoutPath}`);
      if (added) nav.openEntry(added.entryId);
    },
  });

  const loadOwnWork = async () => {
    const notes = await attempt(status, () => ctx.call<(OwnWorkNote & { inLedger: boolean })[]>("ownWork"));
    if (signal.aborted || !notes) return;
    ownList.replaceChildren(...(notes.length ? [] : [h("li", { class: "lh-harness-muted" }, "No Decision, Experiment or Architecture notes in the vault.")]), ...notes.map(note => {
      const li = h("li", {}, h("span", {}, note.path), h("code", { class: "lh-harness-muted" }, ` ${note.entryId} `));
      button(li, {
        label: note.inLedger ? "Open entry" : "Add", size: "sm", variant: "outline",
        onClick: async () => {
          if (!note.inLedger && !(await attempt(status, () => ctx.call("addOwnWork", { path: note.path }), () => `Added ${note.entryId}.`))) return;
          nav.openEntry(note.entryId);
        },
      });
      return li;
    }));
  };
  await loadOwnWork();
  return () => { searchGeneration++; root.remove(); };
}
