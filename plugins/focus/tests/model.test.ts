import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_SETTINGS, parsePls, parseSettings, playFirstWorking } from "../src/model.ts";

const fixture = readFileSync(new URL("./fixtures/groovesalad.pls", import.meta.url), "utf8");

test("parsePls reads every stream from a recorded SomaFM playlist in order", () => {
  assert.deepEqual(parsePls(fixture), [
    "https://ice4.somafm.com/groovesalad-128-mp3",
    "https://ice6.somafm.com/groovesalad-128-mp3",
    "https://ice2.somafm.com/groovesalad-128-mp3",
    "https://ice5.somafm.com/groovesalad-128-mp3",
  ]);
});

test("parsePls orders by FileN index, tolerates CRLF and skips non-http entries", () => {
  const text = "[playlist]\r\nFile2=https://b.example/stream\r\nFile1=https://a.example/stream\r\nFile3=/local/file.mp3\r\nTitle1=A\r\n";
  assert.deepEqual(parsePls(text), ["https://a.example/stream", "https://b.example/stream"]);
  assert.deepEqual(parsePls("<html>not a playlist</html>"), []);
});

test("playFirstWorking falls back past failing streams and reports which failed", async () => {
  const tried: string[] = [];
  const result = await playFirstWorking(["dead-1", "dead-2", "live"], async url => {
    tried.push(url);
    if (url.startsWith("dead")) throw new Error("unreachable");
  });
  assert.deepEqual(tried, ["dead-1", "dead-2", "live"]);
  assert.deepEqual(result, { url: "live", failed: ["dead-1", "dead-2"] });
});

test("playFirstWorking throws when every stream fails", async () => {
  await assert.rejects(playFirstWorking(["a", "b"], async () => { throw new Error("down"); }), /None of 2 streams responded/);
});

test("playFirstWorking stops trying once aborted", async () => {
  const controller = new AbortController();
  const tried: string[] = [];
  await assert.rejects(playFirstWorking(["a", "b"], async url => { tried.push(url); controller.abort(new Error("stopped")); throw new Error("down"); }, controller.signal), /stopped/);
  assert.deepEqual(tried, ["a"]);
});

test("parseSettings keeps valid fields, clamps volume and defaults the rest", () => {
  assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({ source: "music", station: "fluid", playlist: "Music", volume: 140 }), { source: "music", station: "fluid", playlist: "Music", volume: 100 });
  assert.deepEqual(parseSettings({ source: "spotify", station: "nope", playlist: "  ", volume: "loud" }), DEFAULT_SETTINGS);
});
