#!/usr/bin/env node
// Write a chat record plus graph ledgers whose provenance points into it, in the
// on-disk format LearnHarness 0.7.0 reads (src/store/chats.ts, src/store/graph.ts,
// src/core/contracts/graph.ts). The server reads the ledgers on every request,
// so seeding a running instance needs no restart.
// Usage: node seed-graph.mjs <state.json> [--fixture <graph.json>]
//        node seed-graph.mjs --data <isolated data dir> [--fixture <graph.json>]
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE = path.join(HERE, "fixtures/graph.json");
const REAL_PROFILE = path.join(os.homedir(), "Library/Application Support/LearnHarness");
const CHAT_VERSION = 2;
const GRAPH_FORMAT_VERSION = 1;

const token = (prefix) => `${prefix}${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

function chatMessage({ role, text }, index, base) {
	const common = { id: token("msg_"), timestamp: base + index * 1000 };
	if (role === "user") return { role, content: text, ...common };
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "custom",
		model: "seed",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		...common,
	};
}

const appendJsonl = (file, records) => fs.appendFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");

/** Returns the ids it minted so a caller can assert on them in the UI or via ctx.learning. */
export function seedGraph(dataDir, fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, "utf8"))) {
	if (path.resolve(dataDir).startsWith(REAL_PROFILE)) throw new Error(`refusing to seed the real profile at ${dataDir}`);
	const base = Date.now() - fixture.chat.messages.length * 1000;
	const now = new Date().toISOString();
	const messages = fixture.chat.messages.map((m, i) => chatMessage(m, i, base));
	const chat = { id: token("chat_"), title: fixture.chat.title, createdAt: new Date(base).toISOString(), updatedAt: now, messages, version: CHAT_VERSION };
	const provenance = (indexes) => indexes.map((i) => ({ chatId: chat.id, messageId: messages[i].id }));

	const nodeIds = Object.fromEntries(fixture.propositions.map((p) => [p.key, token("n_")]));
	const nodes = fixture.propositions.map((p) => ({ id: nodeIds[p.key], name: p.name, statement: p.statement, aliases: [], createdAt: now, provenance: provenance(p.messages) }));
	const chains = fixture.chains.map((c) => ({ id: token("arg_"), premises: c.premises.map((k) => nodeIds[k]), conclusion: nodeIds[c.conclusion], provenance: provenance(c.messages), createdAt: now }));

	const chats = path.join(dataDir, "chats");
	const graph = path.join(dataDir, "graph");
	fs.mkdirSync(chats, { recursive: true });
	fs.mkdirSync(graph, { recursive: true });
	fs.writeFileSync(path.join(chats, `${chat.id}.json`), JSON.stringify(chat, null, "\t"));
	if (!fs.existsSync(path.join(graph, "format.json"))) fs.writeFileSync(path.join(graph, "format.json"), JSON.stringify({ version: GRAPH_FORMAT_VERSION }, null, "\t") + "\n");
	appendJsonl(path.join(graph, "nodes.jsonl"), nodes);
	appendJsonl(path.join(graph, "chains.jsonl"), chains);
	// A checkpoint marks the chat as already folded, so the extractor does not re-read it.
	appendJsonl(path.join(graph, "sessions.jsonl"), [{ chatId: chat.id, foldedAt: chat.updatedAt }]);
	return { chatId: chat.id, messageIds: messages.map((m) => m.id), nodeIds, chainIds: chains.map((c) => c.id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values, positionals } = parseArgs({ allowPositionals: true, options: { data: { type: "string" }, fixture: { type: "string" } } });
	const dataDir = values.data ?? (positionals[0] && JSON.parse(fs.readFileSync(positionals[0], "utf8")).dataDir);
	if (!dataDir) {
		console.error("usage: seed-graph.mjs <state.json> | --data <dir> [--fixture <graph.json>]");
		process.exit(2);
	}
	const fixture = values.fixture ? JSON.parse(fs.readFileSync(values.fixture, "utf8")) : undefined;
	console.log(JSON.stringify(seedGraph(dataDir, fixture)));
}
