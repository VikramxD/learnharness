#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadScript } from "./fake-model.mjs";
import { assertIsolated } from "./isolation.mjs";
import { teardown } from "./teardown.mjs";

export const RELEASED_APP = process.env.LH_VERIFY_APP ?? "/Applications/LearnHarness.app";
export const BUILD_STAMP = "product-build.json";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_PREFIX = "lh-verify-";

export function resolvePluginDist(dir) {
	for (const candidate of [path.join(dir, "dist"), dir]) {
		const manifest = path.join(candidate, "manifest.json");
		if (fs.existsSync(manifest)) return { dist: candidate, id: JSON.parse(fs.readFileSync(manifest, "utf8")).id };
	}
	throw new Error(`No manifest.json in ${dir} or ${dir}/dist`);
}

export function freePort(requested = 0) {
	return new Promise((resolve, reject) => {
		const probe = net.createServer().once("error", () => reject(new Error(`port ${requested} is already in use on 127.0.0.1`)));
		probe.listen(requested, "127.0.0.1", () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

export function seedDataDir(root, plugins) {
	const data = path.join(root, "data");
	fs.mkdirSync(path.join(root, "home"), { recursive: true });
	fs.mkdirSync(data, { recursive: true });
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

function isolationEnv(root, data, port) {
	return {
		PATH: process.env.PATH,
		TMPDIR: os.tmpdir(),
		HOME: path.join(root, "home"),
		NODE_ENV: "production",
		PORT: String(port),
		HOSTNAME: "127.0.0.1",
		LH_DATA_DIR: data,
		LH_AUTH_FILE: path.join(root, "auth.json"),
		LH_IGNORE_ENV_KEYS: "1",
	};
}

const LAUNCHERS = {
	released({ app }) {
		const resources = path.join(app, "Contents/Resources");
		const standalone = path.join(resources, "server/standalone");
		return {
			binary: path.join(app, "Contents/MacOS/LearnHarness"),
			args: ["--require", path.join(resources, "server-title-guard.cjs"), path.join(standalone, "server.js")],
			cwd: standalone,
			env: { ELECTRON_RUN_AS_NODE: "1" },
		};
	},
	source({ repo }) {
		const standalone = path.join(repo, ".next/standalone");
		return { binary: process.execPath, args: [path.join(standalone, "server.js")], cwd: standalone, env: {} };
	},
};

/** target is {kind:"released", app} or {kind:"source", repo}; the result is everything spawn needs. */
export function resolveTarget(target, env) {
	const launch = LAUNCHERS[target.kind];
	if (!launch) throw new Error(`unknown boot target kind: ${target.kind}`);
	const spec = launch(target);
	return { ...spec, env: { ...env, ...spec.env } };
}

const git = (repo, ...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

export function sourceRevision(repo) {
	return { commit: git(repo, "rev-parse", "HEAD"), dirty: git(repo, "status", "--porcelain") !== "" };
}

function readStamp(repo) {
	try {
		return JSON.parse(fs.readFileSync(path.join(repo, ".next/standalone", BUILD_STAMP), "utf8"));
	} catch {
		return null;
	}
}

/** Builds the fork's standalone server unless the stamp already matches a clean HEAD. Build output goes to stderr. */
export function ensureSourceBuild(repo, { rebuild = false } = {}) {
	const revision = sourceRevision(repo);
	const stamp = readStamp(repo);
	if (!rebuild && !revision.dirty && stamp?.commit === revision.commit && fs.existsSync(path.join(repo, ".next/standalone/server.js"))) {
		return { built: false, stamp };
	}
	const { NODE_ENV, ...env } = process.env;
	const run = (command, args) => execFileSync(command, args, { cwd: repo, env, stdio: ["ignore", process.stderr, process.stderr] });
	run("npm", ["run", "build"]);
	run(process.execPath, ["scripts/build-server.mjs"]);
	// next build rewrites the committed dev variant of next-env.d.ts; left alone, the tree reads dirty and every boot rebuilds.
	if (!revision.dirty) git(repo, "checkout", "--", "next-env.d.ts");
	const fresh = { ...revision, builtAt: new Date().toISOString() };
	fs.writeFileSync(path.join(repo, ".next/standalone", BUILD_STAMP), JSON.stringify(fresh, null, "\t") + "\n");
	return { built: true, stamp: fresh };
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

export async function boot({ source, app = RELEASED_APP, rebuild = false, plugins: pluginDirs = [], port, script, vault, timeoutMs = 60_000 }) {
	const plugins = pluginDirs.map(resolvePluginDist);
	const target = source ? { kind: "source", repo: path.resolve(source) } : { kind: "released", app };
	const build = target.kind === "source" ? ensureSourceBuild(target.repo, { rebuild }) : null;
	assertIsolated(os.tmpdir());
	const root = fs.mkdtempSync(path.join(os.tmpdir(), ROOT_PREFIX));
	const state = { version: 1, root, target, build: build?.stamp ?? null, pids: [], startedAt: new Date().toISOString() };
	const statePath = path.join(root, "state.json");
	const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, "\t"));
	save();
	try {
		for (const dir of [path.join(root, "data"), path.join(root, "auth.json"), path.join(root, "vault")]) assertIsolated(dir);
		state.dataDir = seedDataDir(root, plugins);
		if (vault) {
			state.vault = path.join(root, "vault");
			fs.cpSync(vault, state.vault, { recursive: true });
		}
		state.port = await freePort(port);
		state.url = `http://127.0.0.1:${state.port}`;
		state.serverLog = path.join(root, "server.log");
		const launch = resolveTarget(target, isolationEnv(root, state.dataDir, state.port));
		const server = spawnDetached(launch.binary, launch.args, { cwd: launch.cwd, env: launch.env, log: state.serverLog });
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
		options: {
			source: { type: "string" },
			rebuild: { type: "boolean" },
			plugins: { type: "string" },
			port: { type: "string" },
			script: { type: "string" },
			vault: { type: "string" },
			timeout: { type: "string" },
		},
	});
	if (values.rebuild && !values.source) {
		console.error("usage: boot.mjs [--source <repo> [--rebuild]] [--plugins <dir1,dir2>] [--port N] [--script <fake-model.json>] [--vault <dir>] [--timeout ms]");
		process.exit(2);
	}
	try {
		const state = await boot({
			source: values.source,
			rebuild: values.rebuild,
			plugins: (values.plugins ?? "").split(",").filter(Boolean).map((p) => path.resolve(p)),
			port: values.port ? Number(values.port) : undefined,
			script: values.script,
			vault: values.vault,
			timeoutMs: values.timeout ? Number(values.timeout) : undefined,
		});
		const target = state.target.kind === "source" ? `source:${state.build.commit.slice(0, 12)}${state.build.dirty ? "+dirty" : ""}` : "released";
		console.log(`ready ${state.url} target=${target} plugins=${state.plugins.map((p) => `${p.id}:${p.status}`).join(",")} state=${state.statePath}`);
	} catch (error) {
		console.error(`boot failed: ${error.message}`);
		process.exit(1);
	}
}
