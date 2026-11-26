export const STATIONS = [
  { id: "groovesalad", name: "Groove Salad" },
  { id: "dronezone", name: "Drone Zone" },
  { id: "deepspaceone", name: "Deep Space One" },
  { id: "fluid", name: "Fluid" },
] as const;

export type StationId = (typeof STATIONS)[number]["id"];
export type Source = "somafm" | "music";

export interface Settings {
  source: Source;
  station: StationId;
  playlist: string;
  /** 0 to 100. */
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = { source: "somafm", station: "groovesalad", playlist: "Library", volume: 40 };

export const isStationId = (value: unknown): value is StationId => STATIONS.some(station => station.id === value);
export const stationName = (id: StationId): string => STATIONS.find(station => station.id === id)!.name;
export const plsUrl = (id: StationId): string => `https://somafm.com/${id}.pls`;

/** Reads stored or submitted settings, keeping valid fields and defaulting the rest. */
export function parseSettings(input: unknown): Settings {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    source: value.source === "music" ? "music" : "somafm",
    station: isStationId(value.station) ? value.station : DEFAULT_SETTINGS.station,
    playlist: typeof value.playlist === "string" && value.playlist.trim() ? value.playlist : DEFAULT_SETTINGS.playlist,
    volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.min(100, Math.max(0, Math.round(value.volume))) : DEFAULT_SETTINGS.volume,
  };
}

/** Stream URLs from a .pls playlist, in FileN order. */
export function parsePls(text: string): string[] {
  const entries: [number, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*File(\d+)\s*=\s*(\S+)\s*$/i.exec(line);
    if (match && /^https?:\/\//i.test(match[2]!)) entries.push([Number(match[1]), match[2]!]);
  }
  return entries.sort((a, b) => a[0] - b[0]).map(([, url]) => url);
}

export interface FallbackResult { url: string; failed: string[] }

/** Tries each URL in order and returns the first that starts; throws with every failure when none does. */
export async function playFirstWorking(urls: readonly string[], start: (url: string) => Promise<void>, signal?: AbortSignal): Promise<FallbackResult> {
  const failed: string[] = [];
  for (const url of urls) {
    signal?.throwIfAborted();
    try {
      await start(url);
      return { url, failed };
    } catch {
      if (signal?.aborted) throw signal.reason;
      failed.push(url);
    }
  }
  throw new Error(urls.length ? `None of ${urls.length} streams responded.` : "The station listed no streams.");
}
