#!/usr/bin/env node
// A stand-in for the Modal CLI that runs the "remote" script locally with python3. It never contacts Modal.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const stateFile = path.join(path.dirname(self), "fake-modal-state.json");
const args = process.argv.slice(2);
appendFileSync(path.join(path.dirname(self), "fake-modal-calls.log"), `${JSON.stringify(args)}\n`);

const load = () => { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return { apps: [] }; } };
const save = state => { const tmp = `${stateFile}.${process.pid}`; writeFileSync(tmp, JSON.stringify(state, null, 2)); renameSync(tmp, stateFile); };
const change = (id, update) => { const state = load(); const app = state.apps.find(a => a.app_id === id); if (app) update(app); save(state); return app; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alnum = n => [...randomBytes(n)].map(b => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");

const [command, sub] = args;
if (command === "--version") {
  console.log("modal client version: fake");
} else if (command === "run") {
  const name = args[args.indexOf("--name") + 1];
  const [script, ...scriptArgs] = args.slice(args.indexOf("--name") + 2);
  const id = `ap-${alnum(22)}`;
  const state = load();
  state.apps.push({ app_id: id, description: name, state: "ephemeral (detached)", tasks: "1", created_at: new Date().toISOString(), stopped_at: null, logs: "", pid: null });
  save(state);
  console.log(`✓ Initialized. View run at https://modal.com/apps/fake/main/${id}`);
  const worker = spawn(process.execPath, [self, "__worker", id, script, ...scriptArgs], { detached: true, stdio: "ignore", env: process.env });
  worker.unref();
  while (load().apps.find(a => a.app_id === id)?.state !== "stopped") await sleep(200);
  console.log("✓ App completed.");
} else if (command === "__worker") {
  const [, id, script, ...scriptArgs] = args;
  const child = spawn("python3", [script, ...scriptArgs], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  change(id, app => { app.pid = child.pid; });
  const append = chunk => change(id, app => { app.logs += chunk.toString(); });
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", () => change(id, app => { app.state = "stopped"; app.tasks = "0"; app.stopped_at = new Date().toISOString(); }));
} else if (command === "app" && sub === "list") {
  console.log(JSON.stringify(load().apps.map(({ logs, pid, ...app }) => app), null, 2));
} else if (command === "app" && sub === "logs") {
  process.stdout.write(load().apps.find(a => a.app_id === args[2])?.logs ?? "");
} else if (command === "app" && sub === "stop") {
  const app = change(args.at(-1), app => { app.state = "stopped"; app.stopped_at = new Date().toISOString(); });
  if (app?.pid) try { process.kill(app.pid, "SIGKILL"); } catch {}
} else {
  console.error(`fake modal: unsupported command ${args.join(" ")}`);
  process.exit(2);
}
