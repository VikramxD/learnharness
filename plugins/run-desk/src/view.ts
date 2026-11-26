import type { PluginFrontendContext } from "learnharness-plugin-api";
import type { RunRow } from "./backend.ts";
import { openLaunchDialog, openTemplateDialog } from "./dialogs.ts";
import { duration, errorText, h, usd } from "./dom.ts";
import { isFinished, type Template } from "./model.ts";
import type { WandbReport } from "./wandb.ts";

export interface DeskStatus {
  modalPath: string;
  modalFound: boolean;
  wandbConfigured: boolean;
  wandbNotice: string;
}

export interface RunDetail {
  run: RunRow;
  evidence: Record<string, unknown> | null;
  logs: string;
  wandb: WandbReport | null;
}

const LIVE_REFRESH_MS = 15_000;

export function mountDeskView(ctx: PluginFrontendContext, container: HTMLElement, signal: AbortSignal): () => void {
  const root = h("div", { class: "rd-root" });
  container.append(root);
  let selected: string | undefined;
  let actionError: string | undefined;
  let pass: AbortController | undefined;
  let generation = 0;

  const button = (slot: HTMLElement, label: string, onClick: () => unknown, scope: AbortSignal, variant: "default" | "outline" | "ghost" | "destructive" = "outline") => {
    ctx.ui.mountButton(slot, { label, variant, size: "sm", onClick: async () => { await onClick(); } }, { signal: scope });
    return slot;
  };

  function templatesSection(templates: Template[], scope: AbortSignal) {
    const list = templates.length
      ? h("ul", { class: "rd-list" }, ...templates.map(template => h("li", { class: "rd-template", "data-template": template.name },
          h("div", { class: "rd-template__main" },
            h("span", { class: "rd-template__name" }, template.name),
            h("span", { class: "rd-muted" }, `${template.entryId} · ${template.stage} · ${template.gpu} · ${usd(template.hourlyUsd)}/h · cap ${template.maxRuntimeMinutes} min`)),
          h("div", { class: "rd-row-actions" },
            button(h("span"), "Launch", () => openLaunchDialog(ctx, template, run => { selected = run.id; void render(); }), scope, "default"),
            button(h("span"), "Edit", () => openTemplateDialog(ctx, template, () => void render()), scope),
            button(h("span"), "Delete", async () => { await ctx.call("deleteTemplate", { id: template.id }); await render(); }, scope, "ghost")))))
      : h("p", { class: "rd-muted rd-empty" }, "No run templates yet. A template names the Entry, the stage, the Modal script and its GPU cost.");
    return h("section", { class: "rd-section" },
      h("div", { class: "rd-section__head" }, h("h2", {}, "Templates"), button(h("span"), "New template", () => openTemplateDialog(ctx, undefined, () => void render()), scope)),
      list);
  }

  function runsSection(runs: RunRow[]) {
    if (!runs.length) return h("section", { class: "rd-section" }, h("h2", {}, "Runs"), h("p", { class: "rd-muted rd-empty" }, "No runs yet."));
    const now = Date.now();
    const rows = runs.map(run => {
      const started = run.startedAt ? new Date(run.startedAt) : undefined;
      const elapsed = started ? (run.finishedAt ? Date.parse(run.finishedAt) : now) - started.getTime() : 0;
      const row = h("tr", { class: "rd-run", "data-run": run.id, "data-status": run.status, tabindex: "0" },
        h("td", {}, h("span", { class: "rd-chip", "data-status": run.status }, run.status)),
        h("td", {}, run.template.name),
        h("td", { class: "rd-muted" }, `${run.template.entryId} · ${run.template.stage}`),
        h("td", { class: "rd-muted" }, started ? started.toLocaleString() : "-"),
        h("td", {}, started ? duration(elapsed) : "-"),
        h("td", { class: "rd-cost" }, usd(run.costUsd)),
        h("td", {}, run.outcome ? h("span", { class: "rd-chip", "data-outcome": run.outcome }, run.outcome) : "-"));
      const open = () => { selected = run.id; void render(); };
      row.addEventListener("click", open);
      row.addEventListener("keydown", event => { if (event.key === "Enter") open(); });
      return row;
    });
    return h("section", { class: "rd-section" }, h("h2", {}, "Runs"),
      h("div", { class: "rd-table-wrap" }, h("table", { class: "rd-table" },
        h("thead", {}, h("tr", {}, ...["Status", "Template", "Entry", "Started", "Duration", "Est. cost", "Evidence"].map(label => h("th", {}, label)))),
        h("tbody", {}, ...rows))));
  }

  function metricsBlock(wandb: WandbReport | null) {
    if (!wandb) return h("p", { class: "rd-muted" }, "No W&B run URL appeared in this run's logs.");
    if (wandb.status === "not-configured") return h("p", { class: "rd-notice" }, wandb.notice);
    if (wandb.status === "error") return h("p", { class: "rd-error" }, wandb.error);
    const loss = wandb.loss;
    return h("div", {},
      h("p", { class: "rd-muted" }, `${wandb.path} · ${wandb.state}`),
      h("dl", { class: "rd-facts" }, ...Object.entries(wandb.summary).flatMap(([key, value]) => [h("dt", {}, key), h("dd", {}, String(value))])),
      loss && h("p", { class: "rd-loss" }, `Loss (${loss.key}): ${loss.first} -> ${loss.last} over steps ${loss.firstStep}-${loss.lastStep}, min ${loss.min} at ${loss.minStep}, ${loss.trend} at the end.`));
  }

  function detailSection(detail: RunDetail, scope: AbortSignal) {
    const { run, evidence } = detail;
    const back = button(h("span"), "All runs", () => { selected = undefined; void render(); }, scope, "ghost");
    const stop = !isFinished(run.status) && button(h("span"), "Stop run", async () => {
      try { await ctx.call("stop", { id: run.id }); actionError = undefined; } catch (error) { actionError = `Could not stop the run: ${errorText(error)}`; }
      await render();
    }, scope, "destructive");
    return h("section", { class: "rd-section rd-detail", "data-run": run.id },
      h("div", { class: "rd-section__head" }, back, h("h2", {}, run.template.name), h("span", { class: "rd-chip", "data-status": run.status }, run.status), stop),
      run.error && h("p", { class: "rd-error" }, run.error),
      h("dl", { class: "rd-facts" },
        h("dt", {}, "Modal app"), h("dd", { class: "rd-mono" }, run.appId ?? "not assigned yet"),
        h("dt", {}, "Command"), h("dd", { class: "rd-mono" }, run.command),
        h("dt", {}, "Source"), h("dd", { class: "rd-mono" }, run.source ? `${run.source.repo} @ ${run.source.commit.slice(0, 12)}` : "-"),
        h("dt", {}, "GPU"), h("dd", {}, `${run.template.gpu} at ${usd(run.template.hourlyUsd)}/h, cap ${run.maxRuntimeMinutes} min`),
        h("dt", {}, "Est. cost"), h("dd", {}, usd(run.costUsd)),
        h("dt", {}, "Evidence file"), h("dd", { class: "rd-mono" }, run.evidenceFile ?? "none")),
      h("h3", {}, "Evidence"),
      evidence ? h("pre", { class: "rd-pre rd-evidence" }, JSON.stringify(evidence, null, 2)) : h("p", { class: "rd-muted" }, "No evidence file for this run."),
      h("h3", {}, "Metrics"), metricsBlock(detail.wandb),
      h("h3", {}, "Logs"), h("pre", { class: "rd-pre rd-logs" }, detail.logs.trim() || "No logs yet."));
  }

  async function render() {
    const mine = ++generation;
    try {
      const [status, templates, runs, detail] = await Promise.all([
        ctx.call<DeskStatus>("status"),
        ctx.call<Template[]>("listTemplates"),
        ctx.call<RunRow[]>("listRuns"),
        selected ? ctx.call<RunDetail>("runDetail", { id: selected }) : Promise.resolve(undefined),
      ]);
      if (signal.aborted || mine !== generation) return;
      pass?.abort();
      pass = new AbortController();
      const scope = AbortSignal.any([signal, pass.signal]);
      const refresh = button(h("span"), "Refresh", async () => { await ctx.call("refresh"); await render(); }, scope, "ghost");
      const fresh = h("div", { class: "rd-body" },
        h("header", { class: "rd-header" }, h("h1", {}, "Run Desk"), refresh),
        !status.modalFound && h("p", { class: "rd-notice" }, `Modal CLI not found at ${status.modalPath}. Set its path in Run Desk settings.`),
        !status.wandbConfigured && h("p", { class: "rd-notice rd-wandb-notice" }, status.wandbNotice),
        actionError && h("p", { class: "rd-error", role: "alert" }, actionError),
        detail ? detailSection(detail, scope) : templatesSection(templates, scope),
        !detail && runsSection(runs));
      root.replaceChildren(fresh);
    } catch (error) {
      if (!signal.aborted && mine === generation) root.replaceChildren(h("p", { class: "rd-error" }, `Run Desk could not load: ${errorText(error)}`));
    }
  }

  const stopListening = ctx.onNotification(event => { if (event.topic === "runs") void render(); });
  const timer = window.setInterval(() => { void render(); }, LIVE_REFRESH_MS);
  void render();
  return () => {
    generation++;
    window.clearInterval(timer);
    stopListening();
    pass?.abort();
    root.remove();
  };
}
