#!/usr/bin/env node
// Read-only health check for an instance started by boot.mjs.
// Usage: node doctor.mjs <state.json>   (exit 0 only when every check passes)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

function listenerPid(port) {
	try {
		return Number(execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0]);
	} catch {
		return null;
	}
}

export async function doctor(statePath) {
	const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
	const checks = [];
	const check = (name, ok, detail) => checks.push({ name, ok, detail });
	check("root exists", fs.existsSync(state.root), state.root);
	const owner = listenerPid(state.port);
	check("port owned by recorded server pid", owner === state.pids[0], `port ${state.port} listener=${owner} server=${state.pids[0]}`);
	try {
		const body = await (await fetch(`${state.url}/api/plugins`)).json();
		const list = Array.isArray(body) ? body : body.plugins ?? [];
		for (const { id } of state.plugins ?? []) {
			const status = list.find((p) => p.id === id)?.status ?? "missing";
			check(`plugin ${id} active`, status === "active", status);
		}
	} catch (error) {
		check("GET /api/plugins", false, error.message);
	}
	if (state.fakeModel) {
		try {
			const res = await fetch(`${state.fakeModel.url}/models`);
			check("fake model answers /models", res.ok, state.fakeModel.url);
		} catch (error) {
			check("fake model answers /models", false, error.message);
		}
	}
	return checks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (!process.argv[2]) {
		console.error("usage: doctor.mjs <state.json>");
		process.exit(2);
	}
	const checks = await doctor(process.argv[2]);
	for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name} (${c.detail})`);
	process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
