import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import type { PluginBackendContext, PluginTools } from "learnharness-plugin-api";
import { activate, RUN_REPORT_TOOL, type RunRow } from "../src/backend.ts";
import type { Template } from "../src/model.ts";
import { installFakeModal, optimizeLine, scriptRepo, tempDirectory, until } from "./helpers.ts";

function stubBackend(dataDirectory: string) {
  const handlers = new Map<string, (input: unknown) => unknown>();
  const tools: PluginTools[] = [];
  const emitted: string[] = [];
  const controller = new AbortController();
  const ctx = {
    dataDirectory,
    signal: controller.signal,
    handle(name: string, handler: (input: unknown) => unknown) { handlers.set(name, handler); return () => handlers.delete(name); },
    registerTools(contribution: PluginTools) { tools.push(contribution); return () => {}; },
    events: { emit(topic: string) { emitted.push(topic); }, on() { return () => {}; } },
  } as unknown as PluginBackendContext;
  const dispose = activate(ctx);
  const call = async <T>(name: string, input?: unknown) => (await handlers.get(name)!(input)) as T;
  return { call, tools, emitted, handlers, stop: () => { dispose(); controller.abort(); } };
}

test("templates, a confirmed launch, the run list and run_report work end to end against the fake CLI", async t => {
  const directory = await tempDirectory(t);
  const home = process.env.HOME;
  process.env.HOME = directory;
  t.after(() => { process.env.HOME = home; });
  const fake = installFakeModal(directory);
  const { script } = scriptRepo(directory, `${optimizeLine()}\nprint("wandb: View run at https://wandb.ai/me/dit/runs/abc123")\n`);
  const backend = stubBackend(path.join(directory, "data"));
  t.after(backend.stop);

  assert.ok(!backend.handlers.has("launchFromAgent"));
  assert.deepEqual(backend.tools.map(tool => tool.agents), [["teacher", "practice"]]);
  const [tool] = backend.tools[0]!.create({ chatId: "c", agent: "teacher" });
  assert.equal(tool!.name, RUN_REPORT_TOOL);

  await backend.call("saveSettings", { modalPath: fake.program });
  const status = await backend.call<{ modalFound: boolean; wandbConfigured: boolean }>("status");
  assert.deepEqual({ modalFound: status.modalFound, wandbConfigured: status.wandbConfigured }, { modalFound: true, wandbConfigured: false });

  const invalid = await backend.call<{ errors: string[] }>("saveTemplate", { name: "", entryId: "bogus", stage: "train", script: "job.py", gpu: "", hourlyUsd: 0 });
  assert.equal(invalid.errors.length, 6);
  const saved = await backend.call<{ template: Template }>("saveTemplate", {
    name: "rmsnorm", entryId: "framework.sglang.rmsnorm-kernel", stage: "optimize", script, args: ["--fast"], gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 20,
  });
  await backend.call("saveTemplate", { ...saved.template, name: "rmsnorm v2" });
  const templates = await backend.call<Template[]>("listTemplates");
  assert.deepEqual(templates.map(item => item.name), ["rmsnorm v2"]);

  await assert.rejects(Promise.resolve(backend.call("launch", { templateId: saved.template.id })), /confirmed GPU/);
  const run = await backend.call<RunRow>("launch", { templateId: saved.template.id, confirmed: { gpu: "L4", hourlyUsd: 0.8, maxRuntimeMinutes: 20 } });
  assert.equal(run.status, "running");
  assert.ok(backend.emitted.includes("runs"));

  const done = await until(async () => {
    await backend.call("refresh");
    return (await backend.call<RunRow[]>("listRuns"))[0]!;
  }, row => row.status === "succeeded" || row.status === "failed");
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(done.wandbRunPath, "me/dit/abc123");

  const result = await tool!.execute("call-1", {}, undefined);
  const text = (result.content[0] as { text: string }).text;
  assert.match(text, /: succeeded\. framework\.sglang\.rmsnorm-kernel, optimize stage, L4/);
  assert.match(text, /Evidence: pass optimize evidence for framework\.sglang\.rmsnorm-kernel: step time 41\.8 -> 33\.5 ms/);
  assert.match(text, /W&B not configured/);

  await backend.call("deleteTemplate", { id: saved.template.id });
  assert.deepEqual(await backend.call("listTemplates"), []);
  assert.equal((await backend.call<RunRow[]>("listRuns")).length, 1, "deleting a template keeps its runs");
});
