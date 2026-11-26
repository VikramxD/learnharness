import type { PluginButtonProps, PluginFrontendContext } from "learnharness-plugin-api";
import type { BuildStatus, EntryStages, UnderstandStatus } from "../domain.ts";

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "class") node.className = String(value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return node;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Host buttons scoped to one view mount. */
export function buttons(ctx: PluginFrontendContext, signal: AbortSignal) {
  return (container: HTMLElement, props: PluginButtonProps) => ctx.ui.mountButton(container, props, { signal });
}

export function statusLine(): { node: HTMLElement; show: (text: string, kind?: "ok" | "error") => void } {
  const node = h("p", { class: "lh-harness-status", role: "status" });
  return {
    node,
    show(text, kind = "ok") { node.textContent = text; node.dataset.kind = kind; },
  };
}

/** Run a backend-changing action and report its outcome on the view's status line. */
export async function attempt<T>(status: ReturnType<typeof statusLine>, work: () => Promise<T>, done?: (result: T) => string): Promise<T | undefined> {
  try {
    const result = await work();
    if (done) status.show(done(result));
    return result;
  } catch (error) {
    status.show(errorText(error), "error");
    return undefined;
  }
}

export const STAGE_NAMES = ["understand", "implement", "optimize", "serve"] as const;
const label = (stage: string) => stage[0]!.toUpperCase() + stage.slice(1);

export function pillText(stage: (typeof STAGE_NAMES)[number], status: UnderstandStatus | BuildStatus): string {
  return `${label(stage)}: ${status.state}`;
}

export function stagePills(stages: EntryStages): HTMLElement {
  return h("span", { class: "lh-harness-pills" }, ...STAGE_NAMES.map(stage => {
    const status = stages[stage];
    const title = status.state === "reopened" ? `Gap in ${status.gap.concept}: ${status.gap.why}` : undefined;
    return h("span", { class: "lh-harness-pill", "data-state": status.state, title }, pillText(stage, status));
  }));
}
