import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../src/model.ts";
import { readSettings, writeSettings } from "../src/settings-store.ts";

const freshDirectory = () => path.join(mkdtempSync(path.join(tmpdir(), "focus-")), "data");

test("settings default before the first save", async () => {
  assert.deepEqual(await readSettings(freshDirectory()), DEFAULT_SETTINGS);
});

test("saved settings read back unchanged, as after an app restart", async () => {
  const directory = freshDirectory();
  const saved = await writeSettings(directory, { source: "somafm", station: "deepspaceone", playlist: "Music", volume: 65 });
  assert.deepEqual(await readSettings(directory), saved);
  assert.deepEqual(saved, { source: "somafm", station: "deepspaceone", playlist: "Music", volume: 65 });
  assert.deepEqual(readdirSync(directory), ["settings.json"]);
});

test("a corrupt settings file reads as defaults", async () => {
  const directory = freshDirectory();
  await writeSettings(directory, DEFAULT_SETTINGS);
  writeFileSync(path.join(directory, "settings.json"), "{not json");
  assert.deepEqual(await readSettings(directory), DEFAULT_SETTINGS);
});
