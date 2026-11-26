import assert from "node:assert/strict";
import { test } from "node:test";
import { startFakeModel } from "../fake-model.mjs";

const script = {
	model: "fake-model",
	turns: [
		{ toolCalls: [{ name: "list_sessions", arguments: { limit: 2 } }] },
		{ match: "tool_call_id", content: "after the tool" },
	],
};

async function chat(base, messages, stream = false) {
	const res = await fetch(`${base}/chat/completions`, { method: "POST", body: JSON.stringify({ model: "fake-model", messages, stream }) });
	return stream ? res.text() : res.json();
}

test("lists the scripted model and replays turns in order, honoring match", async (t) => {
	const server = await startFakeModel({ script });
	t.after(() => server.close());
	const base = `http://127.0.0.1:${server.address().port}/v1`;

	assert.deepEqual((await (await fetch(`${base}/models`)).json()).data.map((m) => m.id), ["fake-model"]);

	const unmatched = await chat(base, [{ role: "user", content: "hi" }]);
	const call = unmatched.choices[0].message.tool_calls[0];
	assert.equal(unmatched.choices[0].finish_reason, "tool_calls");
	assert.deepEqual([call.function.name, JSON.parse(call.function.arguments)], ["list_sessions", { limit: 2 }]);

	const streamed = await chat(base, [{ role: "tool", tool_call_id: call.id, content: "[]" }], true);
	assert.match(streamed, /"content":"after the tool"/);
	assert.match(streamed, /"finish_reason":"stop"/);
	assert(streamed.trimEnd().endsWith("data: [DONE]"));

	const exhausted = await chat(base, [{ role: "user", content: "again" }]);
	assert.equal(exhausted.choices[0].message.content, "[fake-model: script exhausted]");
});
