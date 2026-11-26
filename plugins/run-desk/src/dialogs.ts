import type { PluginFrontendContext } from "learnharness-plugin-api";
import { errorText, h, usd } from "./dom.ts";
import { capCostUsd, RUN_STAGES, type Run, type Template } from "./model.ts";

function field(label: string, input: HTMLElement, hint?: string) {
  return h("label", { class: "rd-field" }, h("span", { class: "rd-label" }, label), input, hint && h("span", { class: "rd-muted" }, hint));
}

function textInput(name: string, value: string, placeholder = "") {
  return h("input", { class: "rd-input", name, value, placeholder });
}

function actions(ctx: PluginFrontendContext, signal: AbortSignal, buttons: { label: string; variant?: "default" | "outline"; onClick: () => unknown }[]) {
  const row = h("div", { class: "rd-dialog__actions" });
  const handles = buttons.map(button => {
    const slot = h("span");
    row.append(slot);
    return ctx.ui.mountButton(slot, { label: button.label, variant: button.variant ?? "default", onClick: async () => { await button.onClick(); } }, { signal });
  });
  return { row, handles };
}

export function openTemplateDialog(ctx: PluginFrontendContext, existing: Template | undefined, onSaved: () => void): void {
  const handle = ctx.ui.openDialog({
    title: existing ? "Edit run template" : "New run template",
    content: (container, signal) => {
      const t = existing;
      const inputs = {
        name: textInput("name", t?.name ?? "", "DiT step-time sweep"),
        entryId: textInput("entryId", t?.entryId ?? "", "paper.2212.09748"),
        stage: h("select", { class: "rd-input", name: "stage" }, ...RUN_STAGES.map(stage => h("option", { value: stage }, stage))),
        script: textInput("script", t?.script ?? "", "/Users/you/Projects/repo/modal_bench.py"),
        args: textInput("args", t?.args.join(" ") ?? "", "--steps 200"),
        gpu: textInput("gpu", t?.gpu ?? "", "L4"),
        hourlyUsd: h("input", { class: "rd-input", name: "hourlyUsd", type: "number", step: "0.01", min: "0", value: t ? String(t.hourlyUsd) : "" }),
        maxRuntimeMinutes: h("input", { class: "rd-input", name: "maxRuntimeMinutes", type: "number", step: "1", min: "1", value: String(t?.maxRuntimeMinutes ?? 60) }),
        entity: textInput("wandbEntity", t?.wandb?.entity ?? "", "optional"),
        project: textInput("wandbProject", t?.wandb?.project ?? "", "optional"),
      };
      inputs.stage.value = t?.stage ?? "optimize";
      const errors = h("ul", { class: "rd-error", role: "alert" });
      const save = async () => {
        const result = await ctx.call<{ template: Template } | { errors: string[] }>("saveTemplate", {
          id: t?.id, name: inputs.name.value, entryId: inputs.entryId.value, stage: inputs.stage.value, script: inputs.script.value,
          args: inputs.args.value.split(/\s+/).filter(Boolean), gpu: inputs.gpu.value, hourlyUsd: Number(inputs.hourlyUsd.value),
          maxRuntimeMinutes: Number(inputs.maxRuntimeMinutes.value), wandb: { entity: inputs.entity.value, project: inputs.project.value },
        });
        if (signal.aborted) return;
        if ("errors" in result) { errors.replaceChildren(...result.errors.map(message => h("li", {}, message))); return; }
        handle.dispose();
        onSaved();
      };
      const { row } = actions(ctx, signal, [{ label: "Cancel", variant: "outline", onClick: () => handle.dispose() }, { label: "Save template", onClick: save }]);
      container.append(h("form", { class: "rd-dialog" },
        h("h2", { class: "rd-dialog__title" }, existing ? "Edit run template" : "New run template"),
        field("Name", inputs.name),
        field("Entry id", inputs.entryId, "Copy it from the Handoff, such as framework.sglang.radix-cache."),
        field("Stage", inputs.stage),
        field("Modal script", inputs.script, "Absolute path inside a git repo. Its remote function prints one final line: LH_EVIDENCE {json}."),
        field("Script arguments", inputs.args),
        h("div", { class: "rd-grid" }, field("GPU type", inputs.gpu), field("Hourly cost estimate (USD)", inputs.hourlyUsd), field("Max runtime (min)", inputs.maxRuntimeMinutes)),
        h("div", { class: "rd-grid" }, field("W&B entity", inputs.entity), field("W&B project", inputs.project)),
        errors, row));
    },
  }, { signal: ctx.signal });
}

export function openLaunchDialog(ctx: PluginFrontendContext, template: Template, onLaunched: (run: Run) => void): void {
  const handle = ctx.ui.openDialog({
    title: `Launch ${template.name}`,
    content: (container, signal) => {
      const minutes = h("input", { class: "rd-input", name: "maxRuntimeMinutes", type: "number", min: "1", max: "1440", step: "1", value: String(template.maxRuntimeMinutes) });
      const worst = h("strong", { class: "rd-confirm__worst" });
      const error = h("p", { class: "rd-error", role: "alert" });
      const cap = () => Number(minutes.value);
      const capValid = () => Number.isInteger(cap()) && cap() >= 1 && cap() <= 1440;
      const launchLabel = () => (capValid() ? `Launch and spend up to ${usd(capCostUsd(template.hourlyUsd, cap()))}` : "Launch");
      const launch = async () => {
        if (!capValid()) { error.textContent = "Max runtime must be 1 to 1440 whole minutes."; return; }
        try {
          const run = await ctx.call<Run>("launch", { templateId: template.id, confirmed: { gpu: template.gpu, hourlyUsd: template.hourlyUsd, maxRuntimeMinutes: cap() } });
          if (signal.aborted) return;
          handle.dispose();
          onLaunched(run);
        } catch (failure) {
          if (!signal.aborted) error.textContent = errorText(failure);
        }
      };
      const { row, handles } = actions(ctx, signal, [{ label: "Cancel", variant: "outline", onClick: () => handle.dispose() }, { label: launchLabel(), onClick: launch }]);
      const refresh = () => {
        worst.textContent = capValid() ? usd(capCostUsd(template.hourlyUsd, cap())) : "-";
        handles[1]!.update({ label: launchLabel(), disabled: !capValid() });
      };
      minutes.addEventListener("input", refresh);
      refresh();
      container.append(h("div", { class: "rd-dialog rd-confirm" },
        h("h2", { class: "rd-dialog__title" }, `Launch ${template.name} on Modal?`),
        h("p", { class: "rd-muted" }, "This starts paid GPU compute on your Modal account."),
        h("dl", { class: "rd-facts" },
          h("dt", {}, "GPU"), h("dd", { class: "rd-confirm__gpu" }, template.gpu),
          h("dt", {}, "Hourly estimate"), h("dd", { class: "rd-confirm__hourly" }, `${usd(template.hourlyUsd)}/h`),
          h("dt", {}, "Entry"), h("dd", {}, `${template.entryId} (${template.stage})`),
          h("dt", {}, "Script"), h("dd", { class: "rd-mono" }, [template.script, ...template.args].join(" "))),
        field("Max runtime cap (min)", minutes, "Run Desk stops the app at this cap while LearnHarness is open. The script also gets LH_MAX_RUNTIME_SECONDS for its Modal timeout."),
        h("p", {}, "Worst case at the cap: ", worst),
        error, row));
    },
  }, { signal: ctx.signal });
}
