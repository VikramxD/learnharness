import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GraphSnapshot, PluginBackendContext, PluginInstructions, PluginTools } from "learnharness-plugin-api";
import { activate } from "../src/backend.ts";
import { pluginRoot, tempDirectory } from "./helpers.ts";

async function activateStub(t: Parameters<typeof tempDirectory>[0]) {
  const base = await tempDirectory(t, "harness-tools-");
  const handlers = new Map<string, (input: unknown) => unknown>();
  const instructions: PluginInstructions[] = [];
  const tools: PluginTools[] = [];
  const controller = new AbortController();
  const ctx = {
    directory: pluginRoot,
    dataDirectory: path.join(base, "data"),
    signal: controller.signal,
    learning: { directory: base, listSessions: () => [], getSession: () => null, graph: () => ({ chains: [], propositions: [], sessions: {} }) as unknown as GraphSnapshot },
    handle(name: string, handler: (input: unknown) => unknown) { handlers.set(name, handler); return () => handlers.delete(name); },
    registerInstructions(c: PluginInstructions) { instructions.push(c); return () => {}; },
    registerTools(c: PluginTools) { tools.push(c); return () => {}; },
    events: { emit() {}, on: () => () => {} },
  } as unknown as PluginBackendContext;
  const dispose = activate(ctx);
  t.after(() => { controller.abort(); dispose(); });
  return { base, handlers, instructions, tools };
}

const run = async (tool: AgentTool<any>, params: unknown) => JSON.parse(((await tool.execute("call-1", params as never)).content[0] as { text: string }).text);

test("the three tools and short instructions go to prober, teacher and practice", async t => {
  const { tools, instructions } = await activateStub(t);
  assert.deepEqual(tools.map(c => c.agents), [["prober", "teacher", "practice"]]);
  assert.deepEqual(instructions.map(c => c.agents), [["prober", "teacher", "practice"]]);
  assert.ok(instructions[0]!.text.split("\n").length <= 5, "instructions stay short");
  assert.doesNotMatch(instructions[0]!.text, /must|always|instead of teaching/i, "no change to the teacher's method");
  const loadout = tools[0]!.create({ chatId: "c1", agent: "teacher" });
  assert.deepEqual(loadout.map(tool => tool.name), ["material_search", "material_fetch", "ledger_status"]);
});

test("ledger_status reports stages and material_fetch returns local paths", async t => {
  const { base, handlers, tools } = await activateStub(t);
  await handlers.get("seed")!({});
  const [, fetchTool, status] = tools[0]!.create({ chatId: "c1", agent: "practice" });
  const radix = await run(status!, { entryId: "framework.sglang.radix-cache" });
  assert.deepEqual(radix, [{ id: "framework.sglang.radix-cache", title: "SGLang radix cache", parentId: "framework.sglang", understand: "open", implement: "open", optimize: "open", serve: "open" }]);
  assert.equal((await run(status!, {})).length, 56);

  const pdf = path.join(base, "data/papers/2006.11239/paper.pdf");
  await mkdir(path.dirname(pdf), { recursive: true });
  await writeFile(pdf, "%PDF-");
  assert.deepEqual(await run(fetchTool!, { id: "paper.2006.11239" }), { entryId: "paper.2006.11239", title: "Denoising Diffusion Probabilistic Models", pdfPath: pdf });
  assert.deepEqual((await run(fetchTool!, { id: "2006.11239" })).pdfPath, pdf);
  assert.match((await run(fetchTool!, { id: "framework.sglang" })).missing, /Not checked out yet/);
  await assert.rejects(fetchTool!.execute("c", { id: "nonsense" }), /entry id/);
});
