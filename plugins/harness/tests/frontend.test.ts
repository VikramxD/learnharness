import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { GraphSnapshot, PluginAction, PluginActionPlacement, PluginFrontendContext, PluginLearningData, PluginNotification, PluginView } from "learnharness-plugin-api";
import { createHarness } from "../src/service.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

let activate: typeof import("../src/main.ts").activate;
before(async () => {
  GlobalRegistrator.register();
  ({ activate } = await import("../src/main.ts"));
});
after(() => GlobalRegistrator.unregister());

const flush = () => delay(30);

async function stubHost(t: Parameters<typeof tempDirectory>[0], chains: { id: string; chatId: string }[] = []) {
  const base = await tempDirectory(t, "harness-frontend-");
  const learning = {
    directory: base,
    listSessions: () => [{ id: "c1", title: "DDPM teach", kind: "teach", updatedAt: "x" }],
    getSession: () => ({ id: "c1", messages: [{ text: "paper.2006.11239" }] }),
    graph: () => ({ chains: chains.map(c => ({ id: c.id, premises: ["n1"], conclusion: "n2", provenance: [{ chatId: c.chatId, messageId: "m" }], createdAt: "" })), propositions: [], sessions: {} }) as unknown as GraphSnapshot,
  } as unknown as PluginLearningData;
  const listeners: ((event: PluginNotification) => void)[] = [];
  const harness = createHarness({ directory: pluginRoot, dataDirectory: path.join(base, "data"), learning, notify: topic => { for (const l of listeners) l({ pluginId: "harness", topic }); } });
  const views = new Map<string, PluginView>();
  const actions: PluginAction[] = [];
  const placements: PluginActionPlacement[] = [];
  const opened: string[] = [];
  const buttons = new Map<HTMLElement, { onClick: () => unknown }>();
  const ctx = {
    signal: new AbortController().signal,
    registerView(view: PluginView) { views.set(view.id, view); return () => {}; },
    registerSettings() { return () => {}; },
    registerAction(action: PluginAction) { actions.push(action); return () => {}; },
    placeAction(p: PluginActionPlacement) { placements.push(p); return () => {}; },
    onNotification(l: (event: PluginNotification) => void) { listeners.push(l); return () => {}; },
    onResync() { return () => {}; },
    call: async (operation: string, input?: unknown) => (harness.operations as Record<string, (i: unknown) => unknown>)[operation]!(input),
    app: { openView(id: string) { opened.push(id); }, openSession(id: string) { opened.push(`session:${id}`); } },
    ui: {
      mountButton(container: HTMLElement, props: { label: string; disabled?: boolean; onClick: () => unknown }) {
        const node = document.createElement("button");
        const render = (p: typeof props) => { node.textContent = p.label; node.disabled = Boolean(p.disabled); buttons.set(node, p); };
        render(props);
        node.addEventListener("click", () => { void buttons.get(node)!.onClick(); });
        container.append(node);
        return { update(next: Partial<typeof props>) { render({ ...buttons.get(node)!, ...next } as typeof props); }, dispose() { node.remove(); } };
      },
      openDialog() { return { update() {}, dispose() {} }; },
    },
  } as unknown as PluginFrontendContext;
  activate(ctx);
  const mount = async (id: string) => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = new AbortController();
    await views.get(id)!.mount(container, controller.signal);
    await flush();
    return { container, controller };
  };
  const click = async (container: HTMLElement, label: string) => {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === label);
    assert.ok(button, `button ${label}`);
    button.click();
    await flush();
    return button;
  };
  return { harness, views, actions, placements, opened, mount, click };
}

test("activation registers the ledger, entry and desk views and a sidebar action", async t => {
  const { views, placements, actions, opened } = await stubHost(t);
  assert.deepEqual([...views.keys()], ["ledger", "entry", "desk"]);
  assert.deepEqual(placements.find(p => p.location === "sidebar"), { id: "ledger-sidebar", actionId: "open-ledger", location: "sidebar" });
  await actions.find(a => a.id === "open-ledger")!.run({ placement: "sidebar", surface: "sidebar" } as never);
  assert.deepEqual(opened, ["ledger"]);
});

test("the ledger seeds, groups entries by lineage with four stage pills, filters, and opens an entry", async t => {
  const { mount, click, opened } = await stubHost(t);
  const { container, controller } = await mount("ledger");
  assert.match(container.textContent!, /The Stage ledger is empty/);
  await click(container, "Seed roadmap");
  assert.match(container.querySelector(".lh-harness-status")!.textContent!, /Seeded 56 entries/);
  const groups = [...container.querySelectorAll(".lh-harness-group h3")].map(n => n.textContent);
  assert.deepEqual(groups, ["Transformers", "Diffusion and flows", "Tokenizers", "Video generation", "World models", "RL for generative models", "Reward models", "Systems", "Frameworks"]);
  const ddpm = container.querySelector('[data-entry="paper.2006.11239"]') as HTMLElement;
  assert.deepEqual([...ddpm.querySelectorAll(".lh-harness-pill")].map(p => p.textContent), ["Understand: open", "Implement: open", "Optimize: open", "Serve: open"]);

  const kind = container.querySelector('select[aria-label="Kind"]') as HTMLSelectElement;
  kind.value = "framework";
  kind.dispatchEvent(new Event("change"));
  assert.equal(container.querySelectorAll(".lh-harness-row").length, 8);
  (container.querySelector('[data-entry="framework.sglang.radix-cache"]') as HTMLElement).click();
  assert.deepEqual(opened, ["entry"]);
  controller.abort();
});

test("the entry view suggests a mentioning session, enables Mark understood only with chains, and copies the goal", async t => {
  localStorage.setItem("harness:selected-entry", "paper.2006.11239");
  let copied = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied = text; } } });
  const { harness, mount, click, opened } = await stubHost(t, [{ id: "arg_1", chatId: "c1" }]);
  await harness.operations.seed();
  const { container, controller } = await mount("entry");
  const markButton = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Mark understood") as HTMLButtonElement;
  assert.equal(markButton().disabled, true, "no linked session yet");
  assert.match(container.textContent!, /Suggested sessionsDDPM teach mentions paper\.2006\.11239, 2006\.11239/);
  await click(container, "Link");
  assert.equal(markButton().disabled, false, "the linked session has a chain");
  await click(container, "Open session");
  assert.deepEqual(opened, ["session:c1"]);
  await click(container, "Mark understood");
  assert.match(container.querySelector(".lh-harness-pills")!.textContent!, /Understand: done/);
  await click(container, "Copy teaching goal");
  assert.match(copied, /^Teach me Denoising Diffusion Probabilistic Models \(paper\.2006\.11239\)/);
  controller.abort();
});
