import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { PluginAction, PluginActionPlacement, PluginDialogProps, PluginFrontendContext, PluginView } from "learnharness-plugin-api";
import type { RunRow } from "../src/backend.ts";
import type { Template } from "../src/model.ts";

let activate: typeof import("../src/main.ts").activate;
before(async () => {
  GlobalRegistrator.register();
  ({ activate } = await import("../src/main.ts"));
});
after(() => GlobalRegistrator.unregister());

const flush = () => delay(30);
const template: Template = {
  id: "t1", name: "rmsnorm bench", entryId: "framework.sglang.rmsnorm-kernel", stage: "optimize",
  script: "/repo/bench.py", args: ["--fast"], gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 30,
};
const run: RunRow = {
  id: "r1", template, appName: "lh-run-desk-r1", appId: "ap-abcdefghijklmnopqrstuv", status: "succeeded",
  queuedAt: "2026-11-26T10:00:00.000Z", startedAt: "2026-11-26T10:00:05.000Z", finishedAt: "2026-11-26T10:30:05.000Z",
  maxRuntimeMinutes: 30, command: "modal run --detach --name lh-run-desk-r1 /repo/bench.py --fast", source: { repo: "/repo", commit: "a81d0e4f00" },
  evidenceFile: "evidence/framework.sglang.rmsnorm-kernel/optimize/20261126T103005Z.json", outcome: "pass", costUsd: 0.4,
};

function stubHost(routes: Record<string, (input: unknown) => unknown>) {
  const calls: { operation: string; input: unknown }[] = [];
  const captured = { view: undefined as PluginView | undefined, settings: undefined as PluginView["mount"] | undefined, actions: [] as PluginAction[], placements: [] as PluginActionPlacement[], opened: [] as string[] };
  const ctx = {
    signal: new AbortController().signal,
    registerView(view: PluginView) { captured.view = view; return () => {}; },
    registerSettings(mount: PluginView["mount"]) { captured.settings = mount; return () => {}; },
    registerAction(action: PluginAction) { captured.actions.push(action); return () => {}; },
    placeAction(placement: PluginActionPlacement) { captured.placements.push(placement); return () => {}; },
    onNotification() { return () => {}; },
    app: { openView(id: string) { captured.opened.push(id); } },
    async call(operation: string, input?: unknown) {
      calls.push({ operation, input });
      const route = routes[operation];
      if (!route) throw new Error(`no stub for ${operation}`);
      return route(input);
    },
    ui: {
      mountButton(container: HTMLElement, props: { label: string; onClick: () => unknown; disabled?: boolean }) {
        const node = document.createElement("button");
        let current = props;
        const paint = () => { node.textContent = current.label; node.disabled = !!current.disabled; };
        node.addEventListener("click", () => { void current.onClick(); });
        paint();
        container.append(node);
        return { update(next: object) { current = { ...current, ...next }; paint(); }, dispose() { node.remove(); } };
      },
      mountSettingsRows(container: HTMLElement) { return { update() {}, dispose() {} }; },
      openDialog(props: PluginDialogProps) {
        const host = document.createElement("div");
        host.className = "stub-dialog";
        document.body.append(host);
        const controller = new AbortController();
        if (typeof props.content === "function") void props.content(host, controller.signal);
        else host.append(props.content);
        return { update() {}, dispose() { controller.abort(); host.remove(); } };
      },
    },
  } as unknown as PluginFrontendContext;
  activate(ctx);
  return { captured, calls };
}

const baseRoutes = (overrides: Record<string, (input: unknown) => unknown> = {}) => ({
  status: () => ({ modalPath: "/x/modal", modalFound: true, wandbConfigured: false, wandbNotice: "W&B not configured: add a key." }),
  listTemplates: () => [template],
  listRuns: () => [run],
  ...overrides,
});

async function mountView(routes: Record<string, (input: unknown) => unknown>) {
  const host = stubHost(routes);
  const container = document.createElement("div");
  document.body.append(container);
  const controller = new AbortController();
  await host.captured.view!.mount(container, controller.signal);
  await flush();
  return { ...host, container, controller };
}

const buttonIn = (root: ParentNode, label: string) => [...root.querySelectorAll("button")].find(button => button.textContent === label) as HTMLButtonElement;

test("activation registers the desk view, settings and a sidebar action", () => {
  const { captured } = stubHost(baseRoutes());
  assert.equal(captured.view?.id, "desk");
  assert.equal(typeof captured.settings, "function");
  assert.deepEqual(captured.placements, [{ id: "desk-sidebar", actionId: "open-desk", location: "sidebar" }]);
  void captured.actions[0]!.run({ placement: "sidebar", surface: "sidebar" });
  assert.deepEqual(captured.opened, ["desk"]);
});

test("the desk lists templates and runs with status and cost, and shows the W&B notice", async () => {
  const { container, controller } = await mountView(baseRoutes());
  assert.match(container.querySelector(".rd-template")!.textContent!, /rmsnorm bench.*L4 · \$0\.80\/h · cap 30 min/);
  const row = container.querySelector(".rd-run")!;
  assert.equal(row.querySelector(".rd-chip")!.textContent, "succeeded");
  assert.equal(row.querySelector(".rd-cost")!.textContent, "$0.40");
  assert.equal(container.querySelector(".rd-wandb-notice")!.textContent, "W&B not configured: add a key.");
  controller.abort();
});

test("cancelling the launch dialog never calls launch; confirming sends what the dialog showed", async () => {
  const { container, calls, controller } = await mountView(baseRoutes({ launch: () => ({ ...run, status: "running" }), runDetail: () => ({ run, evidence: null, logs: "", wandb: null }) }));
  buttonIn(container, "Launch").click();
  await flush();
  const dialog = () => document.querySelector(".stub-dialog") as HTMLElement | null;
  assert.equal(dialog()!.querySelector(".rd-confirm__gpu")!.textContent, "L4");
  assert.equal(dialog()!.querySelector(".rd-confirm__hourly")!.textContent, "$0.80/h");
  assert.equal(dialog()!.querySelector(".rd-confirm__worst")!.textContent, "$0.40");
  buttonIn(dialog()!, "Cancel").click();
  await flush();
  assert.equal(dialog(), null);
  assert.equal(calls.filter(call => call.operation === "launch").length, 0);

  buttonIn(container, "Launch").click();
  await flush();
  const minutes = dialog()!.querySelector("input[name=maxRuntimeMinutes]") as HTMLInputElement;
  minutes.value = "90";
  minutes.dispatchEvent(new Event("input"));
  assert.equal(dialog()!.querySelector(".rd-confirm__worst")!.textContent, "$1.20");
  buttonIn(dialog()!, "Launch and spend up to $1.20").click();
  await flush();
  assert.deepEqual(calls.find(call => call.operation === "launch")!.input, { templateId: "t1", confirmed: { gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 90 } });
  assert.equal(dialog(), null);
  controller.abort();
});

test("the template form shows backend errors and closes after a valid save", async () => {
  let attempt = 0;
  const { container, calls, controller } = await mountView(baseRoutes({
    saveTemplate: () => (++attempt === 1 ? { errors: ["Name is required."] } : { template }),
  }));
  buttonIn(container, "New template").click();
  await flush();
  const dialog = document.querySelector(".stub-dialog") as HTMLElement;
  buttonIn(dialog, "Save template").click();
  await flush();
  assert.equal(dialog.querySelector(".rd-error")!.textContent, "Name is required.");
  (dialog.querySelector("input[name=args]") as HTMLInputElement).value = "--steps 200  --fast";
  buttonIn(dialog, "Save template").click();
  await flush();
  assert.deepEqual((calls.filter(call => call.operation === "saveTemplate")[1]!.input as { args: string[] }).args, ["--steps", "200", "--fast"]);
  assert.equal(document.querySelector(".stub-dialog"), null);
  controller.abort();
});

test("a run's detail shows evidence, the W&B notice and logs, and offers Stop only while unfinished", async () => {
  const evidence = { schema: "lh-evidence/1", outcome: "pass" };
  let current: RunRow = run;
  const { container, calls, controller } = await mountView(baseRoutes({
    runDetail: () => ({ run: current, evidence, logs: "LH_EVIDENCE {...}", wandb: { status: "not-configured", notice: "W&B not configured: add a key." } }),
    stop: () => ({ ...current, status: "stopped" }),
  }));
  (container.querySelector(".rd-run") as HTMLElement).click();
  await flush();
  assert.equal(JSON.parse(container.querySelector(".rd-evidence")!.textContent!).outcome, "pass");
  assert.equal(container.querySelector(".rd-logs")!.textContent, "LH_EVIDENCE {...}");
  assert.equal(buttonIn(container, "Stop run"), undefined);

  current = { ...run, status: "running", finishedAt: undefined };
  buttonIn(container, "All runs").click();
  await flush();
  (container.querySelector(".rd-run") as HTMLElement).click();
  await flush();
  buttonIn(container, "Stop run").click();
  await flush();
  assert.deepEqual(calls.find(call => call.operation === "stop")!.input, { id: "r1" });
  controller.abort();
});
