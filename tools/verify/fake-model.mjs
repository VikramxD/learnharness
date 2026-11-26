#!/usr/bin/env node
// OpenAI-compatible loopback chat server that replays a scripted list of
// assistant turns. Usage: node fake-model.mjs --script <file.json> [--port N] [--log <file.jsonl>]
//
// Script shape:
//   { "model": "fake-model", "turns": [ { "match"?: "<regex>", "content"?: "...",
//       "toolCalls"?: [ { "name": "...", "arguments": { ... } } ] } ] }
// Each POST /v1/chat/completions serves the first unserved turn whose `match`
// (if any) tests true against the request's JSON-encoded messages.
import http from "node:http";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export function loadScript(file) {
	const script = JSON.parse(fs.readFileSync(file, "utf8"));
	if (!Array.isArray(script.turns)) throw new Error(`${file}: "turns" must be an array`);
	return { model: script.model ?? "fake-model", turns: script.turns };
}

export function startFakeModel({ script, port = 0, log }) {
	const served = new Set();
	const record = (entry) => log && fs.appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");

	function nextTurn(messages) {
		const haystack = JSON.stringify(messages ?? []);
		for (const [index, turn] of script.turns.entries()) {
			if (served.has(index)) continue;
			if (turn.match && !new RegExp(turn.match).test(haystack)) continue;
			served.add(index);
			return { index, turn };
		}
		return { index: -1, turn: { content: "[fake-model: script exhausted]" } };
	}

	const server = http.createServer(async (req, res) => {
		const path = new URL(req.url, "http://x").pathname.replace(/^\/v1/, "");
		if (req.method === "GET" && path === "/models") {
			return json(res, { object: "list", data: [{ id: script.model, object: "model", owned_by: "fake" }] });
		}
		if (req.method === "POST" && path === "/chat/completions") {
			let body = "";
			for await (const chunk of req) body += chunk;
			const request = JSON.parse(body || "{}");
			const { index, turn } = nextTurn(request.messages);
			record({ served: index, stream: Boolean(request.stream), tools: (request.tools ?? []).map((t) => t.function?.name), lastMessage: request.messages?.at(-1) });
			return request.stream ? stream(res, script.model, turn) : json(res, completion(script.model, turn));
		}
		res.writeHead(404, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: { message: `fake-model: no route ${req.method} ${req.url}` } }));
	});
	return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function json(res, body) {
	res.writeHead(200, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

const toolCalls = (turn) =>
	(turn.toolCalls ?? []).map((call, i) => ({
		index: i,
		id: call.id ?? `call_fake_${i}_${Date.now().toString(36)}`,
		type: "function",
		function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
	}));
const finishReason = (turn) => (turn.toolCalls?.length ? "tool_calls" : "stop");
const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

function completion(model, turn) {
	const calls = toolCalls(turn).map(({ index: _index, ...call }) => call);
	return {
		id: `chatcmpl_fake_${Date.now().toString(36)}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, finish_reason: finishReason(turn), message: { role: "assistant", content: turn.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) } }],
		usage,
	};
}

function stream(res, model, turn) {
	res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
	const base = { id: `chatcmpl_fake_${Date.now().toString(36)}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
	const send = (choices, extra = {}) => res.write(`data: ${JSON.stringify({ ...base, choices, ...extra })}\n\n`);
	send([{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]);
	if (turn.content) send([{ index: 0, delta: { content: turn.content }, finish_reason: null }]);
	const calls = toolCalls(turn);
	if (calls.length) send([{ index: 0, delta: { tool_calls: calls }, finish_reason: null }]);
	send([{ index: 0, delta: {}, finish_reason: finishReason(turn) }]);
	send([], { usage });
	res.end("data: [DONE]\n\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({ options: { script: { type: "string" }, port: { type: "string", default: "0" }, log: { type: "string" } } });
	if (!values.script) throw new Error("usage: fake-model.mjs --script <file.json> [--port N] [--log <file.jsonl>]");
	const server = await startFakeModel({ script: loadScript(values.script), port: Number(values.port), log: values.log });
	console.log(`fake-model http://127.0.0.1:${server.address().port}/v1`);
}
