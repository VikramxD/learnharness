#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "checks");
const checks = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
const failed = [];
for (const check of checks) {
	console.log(`== ${check}`);
	const { status } = spawnSync(process.execPath, [path.join(dir, check)], { stdio: "inherit" });
	if (status !== 0) failed.push(check);
}
console.log(failed.length ? `FAIL ${failed.join(", ")}` : `all ${checks.length} check(s) passed`);
process.exit(failed.length ? 1 : 0);
