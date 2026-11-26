import { execFile } from "node:child_process";

export type MusicResult<T> = { ok: true; value: T } | { ok: false; reason: "denied" | "unavailable"; message: string };

export const AUTOMATION_HELP = "Allow LearnHarness to control Music in System Settings > Privacy & Security > Automation, then try again.";

function osascript(lines: string[], args: string[] = [], signal?: AbortSignal): Promise<MusicResult<string>> {
  const argv = [...lines.flatMap(line => ["-e", line]), ...args];
  return new Promise(resolve => {
    execFile("osascript", argv, { timeout: 15_000, signal }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, value: stdout.trim() });
      // -1743 is errAEEventNotPermitted: the user declined, or has not yet answered, the Automation prompt.
      if (/-1743|not authori[sz]ed/i.test(stderr)) return resolve({ ok: false, reason: "denied", message: AUTOMATION_HELP });
      resolve({ ok: false, reason: "unavailable", message: stderr.trim() || error.message });
    });
  });
}

const map = <A, B>(result: MusicResult<A>, f: (value: A) => B): MusicResult<B> => (result.ok ? { ok: true, value: f(result.value) } : result);

/** "playing", "paused" or "stopped". Does not launch Music when it is closed. */
export const playerState = (signal?: AbortSignal) =>
  osascript(['if application "Music" is running then', 'tell application "Music" to get player state as string', 'else', 'return "stopped"', "end if"], [], signal);

export const playlists = async (signal?: AbortSignal) =>
  map(await osascript(['tell application "Music"', "set out to \"\"", "repeat with p in (get name of every playlist)", "set out to out & p & linefeed", "end repeat", "return out", "end tell"], [], signal),
    text => [...new Set(text.split("\n").map(name => name.trim()).filter(Boolean))]);

export const playPlaylist = async (name: string, volume: number, signal?: AbortSignal) =>
  map(await osascript(["on run argv", 'tell application "Music"', "set sound volume to (item 2 of argv as integer)", "play playlist (item 1 of argv)", "end tell", "end run"], [name, String(volume)], signal), () => undefined);

export const pause = async (signal?: AbortSignal) =>
  map(await osascript(['if application "Music" is running then tell application "Music" to pause'], [], signal), () => undefined);

export const setVolume = async (volume: number, signal?: AbortSignal) =>
  map(await osascript(["on run argv", 'if application "Music" is running then tell application "Music" to set sound volume to (item 1 of argv as integer)', "end run"], [String(volume)], signal), () => undefined);
