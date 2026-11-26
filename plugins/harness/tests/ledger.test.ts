import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { validateEvidence } from "../../../gen-media/contracts/evidence/validate.mjs";
import { createEntries, ingestEvidence, lineagePrerequisites, linkSession, markUnderstood, parseEntryId, stagesOf, unlinkSession, type Entry, type EntryId, type Evidence, type ValidationResult } from "../src/domain.ts";
import { LedgerStore } from "../src/store.ts";
import { tempDirectory } from "./helpers.ts";

const id = (value: string) => parseEntryId(value)!;
const paper = (arxivId: string, lineage = "Diffusion and flows"): Entry => ({ id: id(`paper.${arxivId}`), kind: "paper", title: arxivId, lineage, source: { kind: "paper", arxivId } });
const ddpm = id("paper.2006.11239");

const implement = (outcome: "pass" | "fail", producedAt: string, extra: Partial<Evidence> = {}): Evidence => ({
  schema: "lh-evidence/1", entry: ddpm, stage: "implement", outcome, producedAt,
  source: { repo: "/r", commit: "abc" }, command: "pytest", reference: "diffusers",
  tests: outcome === "pass" ? { passed: 3, total: 3 } : { passed: 1, total: 3 }, ...extra,
} as Evidence);
const valid = (evidence: Evidence): ValidationResult => validateEvidence(evidence) as ValidationResult;

async function store(t: Parameters<typeof tempDirectory>[0]) {
  const directory = await tempDirectory(t, "harness-ledger-");
  return new LedgerStore(path.join(directory, "ledger.jsonl"));
}

test("entry ids match the evidence contract's notion of an entry id", () => {
  const cases = ["paper.2006.11239", "paper.2407.01392v2", "framework.sglang", "framework.sglang.radix-cache", "own.auteur.provider-asset-gates", "paper.1234", "framework.SGLang", "own.auteur", "film.x"];
  for (const value of cases) {
    const contract = validateEvidence({ ...implement("pass", "2026-01-01T00:00:00Z"), entry: value }).ok;
    assert.equal(parseEntryId(value) !== undefined, contract, value);
  }
});

test("a fresh entry is open in every stage, then linked, then done once marked understood", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  assert.deepEqual(stagesOf(await ledger.read(), ddpm), { understand: { state: "open" }, implement: { state: "open" }, optimize: { state: "open" }, serve: { state: "open" } });
  await ledger.transact(s => linkSession(s, ddpm, "chat-1"));
  assert.deepEqual(stagesOf(await ledger.read(), ddpm).understand, { state: "linked", chatIds: ["chat-1"] });
  const { state } = await ledger.transact(s => markUnderstood(s, ddpm, ["chat-1"], ["arg_1"]));
  const understand = stagesOf(state, ddpm).understand;
  assert.equal(understand.state, "done");
  assert.deepEqual(understand.state === "done" && understand.chainIds, ["arg_1"]);
  await ledger.transact(s => unlinkSession(s, ddpm, "chat-1"));
  assert.equal(stagesOf(await ledger.read(), ddpm).understand.state, "done", "unlinking keeps the recorded understanding");
});

test("marking understood without chains is refused", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  await assert.rejects(ledger.transact(s => markUnderstood(s, ddpm, ["chat-1"], [])), /at least one reasoning chain/);
});

test("seeding, linking and ingesting twice append nothing the second time", async t => {
  const ledger = await store(t);
  const seed = [paper("2006.11239"), paper("2010.02502")];
  const evidence = valid(implement("pass", "2026-12-14T10:22:05Z"));
  for (let round = 0; round < 2; round++) {
    const created = await ledger.transact(s => createEntries(s, seed));
    const linked = await ledger.transact(s => linkSession(s, ddpm, "chat-1"));
    const ingested = await ledger.transact(s => ingestEvidence(s, "/e/a.json", "h1", evidence));
    assert.equal(created.appended.length + linked.appended.length + ingested.appended.length, round === 0 ? 4 : 0, `round ${round}`);
  }
  const lines = (await readFile(ledger.file, "utf8")).trim().split("\n");
  assert.equal(lines.length, 4);
  for (const line of lines) {
    const event = JSON.parse(line);
    assert.ok(event.id && event.at, "every event has id and at");
  }
});

test("the same file with new content is ingested again, and the newest producedAt wins", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  await ledger.transact(s => ingestEvidence(s, "/e/late.json", "h1", valid(implement("pass", "2026-12-14T10:00:00Z"))));
  await ledger.transact(s => ingestEvidence(s, "/e/early.json", "h2", valid(implement("fail", "2026-12-01T10:00:00Z"))));
  let implementStatus = stagesOf(await ledger.read(), ddpm).implement;
  assert.equal(implementStatus.state, "done", "an older file ingested later does not win");
  await ledger.transact(s => ingestEvidence(s, "/e/late.json", "h3", valid(implement("fail", "2026-12-20T10:00:00Z"))));
  implementStatus = stagesOf(await ledger.read(), ddpm).implement;
  assert.equal(implementStatus.state, "failed");
  assert.equal(implementStatus.state === "failed" && implementStatus.evidence.sha256, "h3");
});

test("a failure with a gap reopens Understand until a newer Mark understood", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  await ledger.transact(s => linkSession(s, ddpm, "chat-1"));
  await ledger.transact(s => markUnderstood(s, ddpm, ["chat-1"], ["arg_1"]));
  const gap = { concept: "noise schedule", why: "used a linear beta schedule in log space" };
  await ledger.transact(s => ingestEvidence(s, "/e/gap.json", "g1", valid(implement("fail", "2026-12-15T10:00:00Z", { gap }))));
  const reopened = stagesOf(await ledger.read(), ddpm).understand;
  assert.deepEqual(reopened, { state: "reopened", gap: { ...gap, stage: "implement", file: "/e/gap.json" }, chatIds: ["chat-1"] });
  await ledger.transact(s => markUnderstood(s, ddpm, ["chat-1"], ["arg_1", "arg_2"]));
  assert.equal(stagesOf(await ledger.read(), ddpm).understand.state, "done");
});

test("a gap closes when a newer pass replaces the failure for that stage", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  await ledger.transact(s => ingestEvidence(s, "/e/1.json", "g1", valid(implement("fail", "2026-12-15T10:00:00Z", { gap: { concept: "c", why: "w" } }))));
  assert.equal(stagesOf(await ledger.read(), ddpm).understand.state, "reopened");
  await ledger.transact(s => ingestEvidence(s, "/e/2.json", "p1", valid(implement("pass", "2026-12-16T10:00:00Z"))));
  assert.equal(stagesOf(await ledger.read(), ddpm).understand.state, "open");
});

test("rejected files keep their errors until the same path is accepted", async t => {
  const ledger = await store(t);
  const bad = validateEvidence({ ...implement("pass", "2026-12-14T10:00:00Z"), tests: { passed: 2, total: 3 } }) as ValidationResult;
  const { state } = await ledger.transact(s => ingestEvidence(s, "/e/x.json", "b1", bad));
  assert.deepEqual(state.rejected["/e/x.json"]?.errors, ["implement passes only when every test passed."]);
  const fixed = await ledger.transact(s => ingestEvidence(s, "/e/x.json", "b2", valid(implement("pass", "2026-12-14T10:00:00Z"))));
  assert.equal(fixed.state.rejected["/e/x.json"], undefined);
});

test("a file whose folders disagree with its contents is rejected", async t => {
  const ledger = await store(t);
  const { state } = await ledger.transact(s => ingestEvidence(s, "/e/x.json", "h", valid(implement("pass", "2026-12-14T10:00:00Z")), { entry: "paper.2010.02502", stage: "implement" }));
  assert.match(state.rejected["/e/x.json"]!.errors[0]!, /sits under paper\.2010\.02502\/implement but declares paper\.2006\.11239\/implement/);
});

test("a torn final line from a crash is dropped and the log keeps working", async t => {
  const ledger = await store(t);
  await ledger.transact(s => createEntries(s, [paper("2006.11239")]));
  await appendFile(ledger.file, '{"type":"EntryCreated","entry":{"id":"pa');
  const reopened = new LedgerStore(ledger.file);
  assert.deepEqual((await reopened.read()).creationOrder, [ddpm]);
  await reopened.transact(s => createEntries(s, [paper("2010.02502")]));
  assert.deepEqual((await new LedgerStore(ledger.file).read()).creationOrder, [ddpm, id("paper.2010.02502")]);
});

test("concurrent transactions serialize, so a racing duplicate seed appends once", async t => {
  const ledger = await store(t);
  const seed = [paper("2006.11239")];
  const results = await Promise.all([1, 2, 3].map(() => ledger.transact(s => createEntries(s, seed))));
  assert.equal(results.reduce((sum, r) => sum + r.appended.length, 0), 1);
});

test("lineage prerequisites are the earlier entries of the same lineage", async t => {
  const ledger = await store(t);
  const { state } = await ledger.transact(s => createEntries(s, [paper("2006.11239"), paper("1706.03762", "Transformers"), paper("2010.02502"), paper("2206.00364")]));
  assert.deepEqual(lineagePrerequisites(state, id("paper.2206.00364")).map(e => e.id), ["paper.2006.11239", "paper.2010.02502"] as EntryId[]);
});
