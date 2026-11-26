#!/usr/bin/env node
// Boot an isolated LearnHarness (bundled server, Node mode, 127.0.0.1) with the given plugins.
// Usage: node boot.mjs --plugins <dir1,dir2> [--port N] [--script <fake-model.json>] [--vault <dir>] [--timeout ms]
// Prints `ready <url> plugins=<id>:<status>,... state=<file>` and leaves the server running.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadScript } from "./fake-model.mjs";
import { teardown } from "./teardown.mjs";

const APP = process.env.LH_VERIFY_APP ?? "/Applications/LearnHarness.app";
const RESOURCES = path.join(APP, "Contents/Resources");
const STANDALONE = path.join(RESOURCES, "server/standalone");
const BINARY = path.join(APP, "Contents/MacOS/LearnHarness");
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_PREFIX = "lh-verify-";

/** Accepts a plugin root holding dist/manifest.json, or the dist dir itself. */
export function resolvePluginDist(dir) {
	for (const candidate of [path.join(dir, "dist"), dir]) {
		const manifest = path.join(candidate, "manifest.json");
		if (fs.existsSync(manifest)) return { dist: candidate, id: JSON.parse(fs.readFileSync(manifest, "utf8")).id };
	}
	throw new Error(`No manifest.json in ${dir} or ${dir}/dist`);
}

/** Resolves a free loopback port: the requested one if it is free, else any. Rejects if a requested port is taken. */
export function freePort(requested = 0) {
	return new Promise((resolve, reject) => {
		const probe = net.createServer().once("error", () => reject(new Error(`port ${requested} is already in use on 127.0.0.1`)));
		probe.listen(requested, "127.0.0.1", () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

/** Builds the isolated data dir. No path under the user's real profile is written. */
export function seedDataDir(root, plugins) {
	const data = path.join(root, "data");
	fs.mkdirSync(path.join(root, "home"), { recursive: true });
	for (const { id, dist } of plugins) fs.cpSync(dist, path.join(data, "plugins", id, "dist"), { recursive: true });
	fs.writeFileSync(path.join(data, "plugins-state.json"), JSON.stringify({ version: 1, enabled: Object.fromEntries(plugins.map((p) => [p.id, true])) }));
	fs.writeFileSync(path.join(data, "settings.json"), JSON.stringify({ version: 1, general: { autoUpdate: false } }));
	return data;
}

function spawnDetached(command, args, { env, cwd, log }) {
	const out = fs.openSync(log, "a");
	const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", out, out] });
	child.unref();
	fs.closeSync(out);
	return child.pid;
}

/** A minimal env: no inherited provider keys, HOME redirected into the temp root. */
function serverEnv(root, data, port) {
	return {
		PATH: process.env.PATH,
		TMPDIR: os.tmpdir(),
		HOME: path.join(root, "home"),
		ELECTRON_RUN_AS_NODE: "1",
		NODE_ENV: "production",
		PORT: String(port),
		HOSTNAME: "127.0.0.1",
		LH_DATA_DIR: data,
		LH_AUTH_FILE: path.join(root, "auth.json"),
		LH_IGNORE_ENV_KEYS: "1",
	};
}

async function getJson(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
	return res.json();
}

async function waitForPlugins(url, ids, timeoutMs, logFile) {
	const deadline = Date.now() + timeoutMs;
	let last = "no response";
	while (Date.now() < deadline) {
		try {
			const body = await getJson(`${url}/api/plugins`);
			const list = Array.isArray(body) ? body : body.plugins ?? [];
			const statuses = ids.map((id) => ({ id, status: list.find((p) => p.id === id)?.status ?? "missing" }));
			const failed = statuses.filter((s) => s.status === "error");
			if (failed.length) throw Object.assign(new Error(`plugin error: ${JSON.stringify(list.filter((p) => failed.some((f) => f.id === p.id)))}`), { fatal: true });
			if (statuses.every((s) => s.status === "active")) return statuses;
			last = statuses.map((s) => `${s.id}:${s.status}`).join(",");
		} catch (error) {
			if (error.fatal) throw error;
			last = error.message;
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`timed out after ${timeoutMs}ms waiting for plugins (${last}); see ${logFile}`);
}

/** Connects the fake model as the keyless custom provider and selects it for every model slot. */
async function wireFakeModel(url, baseUrl, model) {
	const headers = { "content-type": "application/json", origin: url };
	const current = await fetch(`${url}/api/custom-provider`);
	const connect = await fetch(`${url}/api/custom-provider`, {
		method: "POST",
		headers: { ...headers, "if-match": current.headers.get("etag") },
		body: JSON.stringify({ baseUrl, authMode: "keyless" }),
	});
	if (!connect.ok) throw new Error(`custom provider connect -> ${connect.status} ${await connect.text()}`);
	const slot = { model: { provider: "custom", id: model }, thinkingLevel: "off" };
	const models = await fetch(`${url}/api/settings/models`, { method: "PUT", headers, body: JSON.stringify({ strong: slot, cheap: slot, vision: slot }) });
	if (!models.ok) throw new Error(`model slots -> ${models.status} ${await models.text()}`);
}

export async function boot({ plugins: pluginDirs, port, script, vault, timeoutMs = 60_000 }) {
	const plugins = pluginDirs.map(resolvePluginDist);
	const root = fs.mkdtempSync(path.join(os.tmpdir(), ROOT_PREFIX));
	const state = { version: 1, root, pids: [], startedAt: new Date().toISOString() };
	const statePath = path.join(root, "state.json");
	const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, "\t"));
	save();
	try {
		state.dataDir = seedDataDir(root, plugins);
		if (vault) {
			state.vault = path.join(root, "vault");
			fs.cpSync(vault, state.vault, { recursive: true });
		}
		state.port = await freePort(port);
		state.url = `http://127.0.0.1:${state.port}`;
		state.serverLog = path.join(root, "server.log");
		const server = spawnDetached(BINARY, ["--require", path.join(RESOURCES, "server-title-guard.cjs"), path.join(STANDALONE, "server.js")], {
			cwd: STANDALONE,
			env: serverEnv(root, state.dataDir, state.port),
			log: state.serverLog,
		});
		state.pids.push(server);
		save();
		if (script) {
			const fakePort = await freePort();
			state.fakeModel = { url: `http://127.0.0.1:${fakePort}/v1`, log: path.join(root, "fake-model.jsonl") };
			state.pids.push(spawnDetached(process.execPath, [path.join(HERE, "fake-model.mjs"), "--script", path.resolve(script), "--port", String(fakePort), "--log", state.fakeModel.log], {
				cwd: root,
				env: { PATH: process.env.PATH },
				log: path.join(root, "fake-model.log"),
			}));
			save();
		}
		state.plugins = await waitForPlugins(state.url, plugins.map((p) => p.id), timeoutMs, state.serverLog);
		if (script) {
			await wireFakeModel(state.url, state.fakeModel.url, loadScript(script).model);
		}
		save();
		return { ...state, statePath };
	} catch (error) {
		if (state.serverLog && fs.existsSync(state.serverLog)) error.message += `\n--- server.log tail ---\n${fs.readFileSync(state.serverLog, "utf8").split("\n").slice(-20).join("\n")}`;
		await teardown(statePath).catch(() => {});
		throw error;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: { plugins: { type: "string" }, port: { type: "string" }, script: { type: "string" }, vault: { type: "string" }, timeout: { type: "string" } },
	});
	if (!values.plugins) {
		console.error("usage: boot.mjs --plugins <dir1,dir2> [--port N] [--script <fake-model.json>] [--vault <dir>] [--timeout ms]");
		process.exit(2);
	}
	try {
		const state = await boot({
			plugins: values.plugins.split(",").filter(Boolean).map((p) => path.resolve(p)),
			port: values.port ? Number(values.port) : undefined,
			script: values.script,
			vault: values.vault,
			timeoutMs: values.timeout ? Number(values.timeout) : undefined,
		});
		console.log(`ready ${state.url} plugins=${state.plugins.map((p) => `${p.id}:${p.status}`).join(",")} state=${state.statePath}`);
	} catch (error) {
		console.error(`boot failed: ${error.message}`);
		process.exit(1);
	}
}
