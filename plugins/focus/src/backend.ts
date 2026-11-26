import type { JsonValue, PluginBackendContext } from "learnharness-plugin-api";
import { isStationId, parsePls, plsUrl } from "./model.ts";
import * as music from "./music.ts";
import { readSettings, writeSettings } from "./settings-store.ts";

export function activate(ctx: PluginBackendContext): () => void {
  let startedMusic = false;
  const handle = (name: string, run: (input: unknown) => Promise<unknown>) =>
    ctx.handle(name, async input => (await run(input)) as JsonValue);

  handle("getSettings", () => readSettings(ctx.dataDirectory));
  handle("saveSettings", async input => {
    const saved = await writeSettings(ctx.dataDirectory, input);
    if (saved.source === "music" && startedMusic) await music.setVolume(saved.volume, ctx.signal);
    return saved;
  });

  handle("resolveStation", async input => {
    const station = (input as { station?: unknown } | null)?.station;
    if (!isStationId(station)) throw new Error(`Unknown station "${String(station)}".`);
    const response = await fetch(plsUrl(station), { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok) throw new Error(`SomaFM returned ${response.status} for the station playlist.`);
    const urls = parsePls(await response.text());
    if (!urls.length) throw new Error("The station playlist listed no streams.");
    return urls;
  });

  handle("musicState", () => music.playerState(ctx.signal));
  handle("musicPlaylists", () => music.playlists(ctx.signal));
  handle("musicPlay", async () => {
    const settings = await readSettings(ctx.dataDirectory);
    const result = await music.playPlaylist(settings.playlist, settings.volume, ctx.signal);
    if (result.ok) startedMusic = true;
    return result;
  });
  handle("musicPause", async () => {
    startedMusic = false;
    return music.pause(ctx.signal);
  });

  return () => {
    if (startedMusic) void music.pause();
  };
}
