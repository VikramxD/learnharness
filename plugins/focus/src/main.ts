import type { PluginFrontendContext, PluginSettingsRow, PluginSettingsSchema, PluginWidgetHandle } from "learnharness-plugin-api";
import { parseSettings, STATIONS, stationName, type Settings } from "./model.ts";
import type { MusicResult } from "./music.ts";
import { createPlayer, type Status } from "./player.ts";

const VIEW_ID = "player";
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const ICON_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

export function activate(ctx: PluginFrontendContext): void {
  const player = createPlayer(ctx.call, message => showNotice(message, ctx.signal), ctx.signal);
  const describe = (settings: Settings) => (settings.source === "somafm" ? `${stationName(settings.station)} on SomaFM` : `"${settings.playlist}" in Music`);

  ctx.registerAction({ id: "play", name: "Play focus music", icon: ICON_PLAY, run: () => player.play() });
  ctx.registerAction({ id: "pause", name: "Pause focus music", icon: ICON_PAUSE, run: () => player.stop() });
  ctx.registerAction({ id: "open", name: "Focus", icon: ICON_NOTE, run: () => ctx.app.openView(VIEW_ID) });
  ctx.placeAction({ id: "open-sidebar", actionId: "open", location: "sidebar" });

  let placed: { actionId: string; remove: () => void } | undefined;
  const placeToggle = (status: Status) => {
    const actionId = status === "stopped" ? "play" : "pause";
    if (placed?.actionId === actionId) return;
    placed?.remove();
    placed = { actionId, remove: ctx.placeAction({ id: "toggle", actionId, location: "top-bar", sessions: ["teaching", "practice"], views: [VIEW_ID] }) };
  };
  placeToggle(player.status);
  player.subscribe(placeToggle);

  ctx.registerView({
    id: VIEW_ID,
    name: "Focus",
    mount(container, signal) {
      const root = container.appendChild(document.createElement("div"));
      root.className = "focus-view";
      const heading = root.appendChild(document.createElement("h2"));
      const detail = root.appendChild(document.createElement("p"));
      const controls = root.appendChild(document.createElement("div"));
      controls.className = "focus-controls";
      const toggle = ctx.ui.mountButton(controls, { label: "Play", icon: ICON_PLAY, onClick: () => player.toggle() }, { signal });
      ctx.ui.mountButton(controls, { label: "Settings", variant: "outline", onClick: () => ctx.app.openSettings() }, { signal });
      const render = (status: Status) => {
        heading.textContent = status === "playing" ? "Playing" : status === "starting" ? "Starting" : "Paused";
        detail.textContent = player.settings ? describe(player.settings) : "";
        void toggle.update(status === "stopped" ? { label: "Play", icon: ICON_PLAY } : { label: "Pause", icon: ICON_PAUSE });
      };
      render(player.status);
      const unsubscribe = player.subscribe(render);
      void player.refresh();
      return () => { unsubscribe(); root.remove(); };
    },
  });

  let playlists: string[] = [];
  let playlistError: string | undefined;
  let settingsRows: PluginWidgetHandle<PluginSettingsSchema> | undefined;
  ctx.registerSettings((container, signal) => {
    settingsRows = ctx.ui.mountSettingsRows(container, { rows: [] }, { signal });
    signal.addEventListener("abort", () => { settingsRows = undefined; });
    if (player.settings) renderSettings(player.settings);
    // Listing playlists launches Music, so wait until the user opens these settings with Music chosen.
    if (player.settings?.source === "music") void loadPlaylists().then(() => player.settings && renderSettings(player.settings));
  });

  const save = async (patch: Partial<Settings>) => {
    const saved = await ctx.call<Settings>("saveSettings", { ...player.settings, ...patch });
    if (saved.source === "music" && !playlists.length && settingsRows) await loadPlaylists();
    await player.apply(saved);
    renderSettings(saved);
  };

  const loadPlaylists = async () => {
    const result = await ctx.call<MusicResult<string[]>>("musicPlaylists");
    playlists = result.ok ? result.value : [];
    playlistError = result.ok ? undefined : result.message;
  };

  function renderSettings(settings: Settings) {
    const playlistOptions = [...new Set([settings.playlist, ...playlists])].map(name => ({ value: name, label: name }));
    const rows: PluginSettingsRow[] = [
      { type: "dropdown", key: "source", label: "Source", value: settings.source,
        options: [{ value: "somafm", label: "SomaFM radio" }, { value: "music", label: "Apple Music app" }],
        onChange: value => save({ source: value === "music" ? "music" : "somafm" }) },
      { type: "dropdown", key: "station", label: "Station", value: settings.station, disabled: settings.source !== "somafm",
        options: STATIONS.map(station => ({ value: station.id, label: station.name })),
        onChange: value => save({ station: parseSettings({ station: value }).station }) },
      { type: "dropdown", key: "playlist", label: "Playlist", value: settings.playlist, disabled: settings.source !== "music",
        description: settings.source === "music" ? playlistError : undefined,
        options: playlistOptions, onChange: value => save({ playlist: value }) },
      { type: "slider", key: "volume", label: "Volume", value: settings.volume, min: 0, max: 100, step: 5,
        onChange: value => save({ volume: value }) },
    ];
    void settingsRows?.update({ rows });
  }

  void (async () => {
    const settings = await ctx.call<Settings>("getSettings");
    if (ctx.signal.aborted) return;
    await player.apply(settings);
    renderSettings(settings);
    await player.refresh();
  })();
}

function showNotice(message: string, signal: AbortSignal) {
  const notice = document.body.appendChild(document.createElement("div"));
  notice.className = "focus-notice";
  notice.setAttribute("role", "status");
  notice.textContent = message;
  const remove = () => notice.remove();
  const timer = setTimeout(remove, 6000);
  signal.addEventListener("abort", () => { clearTimeout(timer); remove(); }, { once: true });
}
