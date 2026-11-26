# Plugin view

A plugin adds a sidebar action that opens its own view in the main pane. The view can open standard host dialogs.

## Sub-features

- `view-action` shows the plugin's sidebar action on home.
- `view-open` opens the plugin view with its title in the header.
- `view-dialog` opens a host dialog from inside the view.

## How to get to it (user POV)

- Choose the plugin's action in the left sidebar (hello-plugin: `Open hello view`).
- Choose the same action in a session header, where plugins also place it.

## Driving it with drive.mjs

Preconditions:

- Booted with `--plugins "$HOME/Library/Application Support/LearnHarness/data/plugins/hello-plugin"` (boot copies it; the source stays read-only) or your own plugin.

- **Action visible.** Run `waitFor(page, "text=Open hello view")`. The sidebar shows `OPEN HELLO VIEW`.
- **Open view.** Run `click(page, "text=Open hello view")`, then `waitFor(page, "text=Hello from an external plugin")`. The header reads `Hello plugin`.
- **Dialog.** Run `click(page, "role=button[name='Say hello']")`, then `waitFor(page, "text=Plugin content, standard host dialog.")`. Close it with `page.keyboard.press("Escape")`.
- **Proof.** Screenshot after each step.

## Gotchas

- hello-plugin has no backend. Use `tools/verify/fixtures/echo-plugin` for backend checks.
- A plugin that fails to activate never shows its action. Boot reports it as `error` and exits 1.
