import { playFirstWorking, stationName, type Settings } from "./model.ts";
import type { MusicResult } from "./music.ts";

export type Status = "stopped" | "starting" | "playing";

type Call = <T>(operation: string, input?: unknown) => Promise<T>;

const STREAM_START_TIMEOUT_MS = 10_000;

/** Owns the single audio element for this window, so playback outlives views and sessions. */
export function createPlayer(call: Call, notify: (message: string) => void, signal: AbortSignal) {
  const audio = new Audio();
  audio.preload = "none";
  let settings: Settings | undefined;
  let status: Status = "stopped";
  let attempt: AbortController | undefined;
  const listeners = new Set<(status: Status) => void>();

  const setStatus = (next: Status) => {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener(status);
  };

  const silence = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };

  const startUrl = (url: string, abort: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const done = new AbortController();
      const fail = (reason: unknown) => { done.abort(); reject(reason); };
      const timer = setTimeout(() => fail(new Error("Stream did not start in time.")), STREAM_START_TIMEOUT_MS);
      done.signal.addEventListener("abort", () => clearTimeout(timer));
      audio.addEventListener("playing", () => { done.abort(); resolve(); }, { signal: done.signal });
      audio.addEventListener("error", () => fail(new Error(`Stream failed: ${url}`)), { signal: done.signal });
      abort.addEventListener("abort", () => fail(abort.reason), { signal: done.signal });
      audio.src = url;
      audio.play().catch(fail);
    });

  async function playStation(current: Settings) {
    attempt?.abort();
    const controller = new AbortController();
    attempt = controller;
    setStatus("starting");
    const name = stationName(current.station);
    try {
      const urls = await call<string[]>("resolveStation", { station: current.station });
      const result = await playFirstWorking(urls, url => startUrl(url, controller.signal), controller.signal);
      if (result.failed.length) notify(`${name}: ${result.failed.length} stream${result.failed.length > 1 ? "s" : ""} unreachable, playing a backup.`);
      setStatus("playing");
    } catch (error) {
      if (controller.signal.aborted) return;
      silence();
      setStatus("stopped");
      notify(`Couldn't play ${name}. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (attempt === controller) attempt = undefined;
    }
  }

  async function musicCall(operation: "musicPlay" | "musicPause") {
    const result = await call<MusicResult<unknown>>(operation);
    if (!result.ok) notify(result.message);
    return result.ok;
  }

  // A live stream that drops mid-play restarts from a freshly resolved playlist.
  audio.addEventListener("error", () => {
    if (status === "playing" && settings?.source === "somafm" && !attempt) void playStation(settings);
  }, { signal });

  signal.addEventListener("abort", () => {
    attempt?.abort();
    silence();
    listeners.clear();
  });

  return {
    get status() { return status; },
    get settings() { return settings; },
    subscribe(listener: (status: Status) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Applies saved settings; restarts playback when the station or source changed mid-play. */
    async apply(next: Settings) {
      const previous = settings;
      settings = next;
      audio.volume = next.volume / 100;
      if (!previous || status === "stopped") return;
      if (previous.source !== next.source) {
        await this.stop(previous);
        await this.play();
      } else if (next.source === "somafm" && previous.station !== next.station) {
        await playStation(next);
      }
    },
    async refresh() {
      if (settings?.source !== "music") return;
      const state = await call<MusicResult<string>>("musicState");
      setStatus(state.ok && state.value === "playing" ? "playing" : "stopped");
    },
    async play() {
      if (!settings) return;
      if (settings.source === "somafm") return playStation(settings);
      setStatus("starting");
      setStatus((await musicCall("musicPlay")) ? "playing" : "stopped");
    },
    async stop(using = settings) {
      attempt?.abort();
      if (using?.source === "music") await musicCall("musicPause");
      else silence();
      setStatus("stopped");
    },
    toggle() {
      return status === "stopped" ? this.play() : this.stop();
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;
