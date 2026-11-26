import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NOT_CONFIGURED, netrcKey, wandbReport, WANDB_GRAPHQL } from "../src/wandb.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as unknown;

function recordedFetch() {
  const requests: { url: string; headers: Record<string, string>; body: { query: string; variables: Record<string, unknown> } }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
    requests.push({ url, headers: init.headers, body });
    const payload = body.query.includes("sampledHistory") ? fixture("wandb-history.json") : fixture("wandb-summary.json");
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, requests };
}

test("netrc lookup finds only the api.wandb.ai password", () => {
  assert.equal(netrcKey("machine github.com login a password gh\nmachine api.wandb.ai\n  login user\n  password secret-key\n"), "secret-key");
  assert.equal(netrcKey("machine github.com login a password gh"), undefined);
  assert.equal(netrcKey(""), undefined);
});

test("without a key the report is the not-configured notice and nothing is fetched", async () => {
  let fetched = false;
  const report = await wandbReport("me/proj/abc", { key: "", fetch: async () => { fetched = true; throw new Error("unreachable"); } });
  assert.deepEqual(report, { status: "not-configured", notice: NOT_CONFIGURED });
  assert.equal(fetched, false);
});

test("the recorded GraphQL responses become final metrics and a loss-curve summary", async () => {
  const { fetch, requests } = recordedFetch();
  const report = await wandbReport("me/dit-sweep/k3j2h1", { key: "k", fetch });
  assert.equal(report.status, "ok");
  if (report.status !== "ok") return;
  assert.equal(requests[0]!.url, WANDB_GRAPHQL);
  assert.equal(requests[0]!.headers.authorization, `Basic ${Buffer.from("api:k").toString("base64")}`);
  assert.deepEqual(requests[0]!.body.variables, { entity: "me", project: "dit-sweep", run: "k3j2h1" });
  assert.deepEqual(requests[1]!.body.variables.specs, [JSON.stringify({ keys: ["_step", "loss"], samples: 500 })]);
  assert.deepEqual(report.summary, { _runtime: 1834.2, loss: 0.412, lr: 2e-5, "eval/fid": 18.7, "throughput/img_per_s": 41.3 });
  assert.equal(report.loss?.key, "loss");
  assert.equal(report.loss?.points, 251);
  assert.equal(report.loss?.lastStep, 1999);
  assert.ok(report.loss!.first > 2.4 && report.loss!.last === 0.412);
  assert.equal(report.loss?.trend, "flat");
});

test("a GraphQL error or HTTP failure is reported, not thrown", async () => {
  const errors = await wandbReport("me/p/r", { key: "k", fetch: async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: "permission denied" }] }) }) });
  assert.deepEqual(errors, { status: "error", error: "W&B: permission denied" });
  const http = await wandbReport("me/p/r", { key: "k", fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  assert.deepEqual(http, { status: "error", error: "W&B answered HTTP 401." });
});
