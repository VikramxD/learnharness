import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { seedGraph } from "../seed-graph.mjs";

const readJsonl = (file) => fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("every provenance point names a message in the seeded chat", (t) => {
	const data = fs.mkdtempSync(path.join(os.tmpdir(), "seed-graph-test-"));
	t.after(() => fs.rmSync(data, { recursive: true, force: true }));
	const seeded = seedGraph(data);
	const chat = JSON.parse(fs.readFileSync(path.join(data, "chats", `${seeded.chatId}.json`), "utf8"));
	const messageIds = new Set(chat.messages.map((m) => m.id));
	const nodes = readJsonl(path.join(data, "graph/nodes.jsonl"));
	const chains = readJsonl(path.join(data, "graph/chains.jsonl"));
	const nodeIds = new Set(nodes.map((n) => n.id));
	for (const record of [...nodes, ...chains]) {
		for (const point of record.provenance) {
			assert.equal(point.chatId, chat.id);
			assert(messageIds.has(point.messageId), `${point.messageId} exists in the chat`);
		}
	}
	for (const chain of chains) assert([...chain.premises, chain.conclusion].every((id) => nodeIds.has(id)), "chain endpoints are seeded nodes");
});

test("refuses to write into the real LearnHarness profile", () => {
	assert.throws(() => seedGraph(path.join(os.homedir(), "Library/Application Support/LearnHarness/data")), /refusing/);
});
