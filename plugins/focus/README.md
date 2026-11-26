# Focus

Focus music while you learn in LearnHarness.

## Use

- Click **Play focus music** in the top bar of any teaching or practice session, or open **Focus** from the sidebar. The button becomes **Pause focus music** while music plays.
- Playback continues as you move between sessions and views.
- Open the plugin settings to choose a source, a station or playlist, and the volume. Settings are saved in the plugin data folder.

## Sources

- **SomaFM radio.** Groove Salad, Drone Zone, Deep Space One and Fluid. The plugin reads the station `.pls` playlist when you press play and tries each listed stream in order. If a stream fails, it plays the next one and shows one notice.
- **Apple Music app.** Plays the chosen playlist in Music.app through `osascript`. The first use asks for macOS Automation permission. If you decline, the plugin shows how to allow it in System Settings > Privacy & Security > Automation.

Disabling the plugin stops playback.

## Build

```sh
mkdir -p .sdk && cp -R <authoring-skill>/types/. .sdk/
npm install
npm run typecheck && npm test
npm run install:local -- "<plugins-directory>"
```
