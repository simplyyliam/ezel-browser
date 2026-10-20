# Changelog

All notable changes to Ezel. Versions follow [Semantic Versioning](https://semver.org/); while Ezel is 0.x, a minor version brings new features and a patch version only fixes.

## [0.1.0] - 2026-10-20

The first release: a calm, lightweight browser for designers, on Windows.

### Added
- **The window**: one frameless window with its own titlebar that slides down when you move the pointer to the top edge, and rounded page corners that follow Windows 11.
- **Sidebar**: tabs live in a sidebar that peeks out when you hover the window's left edge, or stays docked next to the page (Ctrl+B).
- **Spaces**: separate groups of tabs, each with a name and an icon; switch, rename, reorder and delete them.
- **Swatches**: up to 8 favourite sites in a grid at the top of the sidebar, shared by every space.
- **Pinned and temporary tabs, and folders**: pin the tabs you keep, let the rest pile up as temporary tabs, and clear those in one go. Folders can be opened, closed and unpacked.
- **Drag and drop** tabs between Swatches, pinned and temporary tabs, and other spaces.
- **Command palette** (Ctrl+T, Ctrl+L or Ctrl+K): type an address or a search, jump to any open tab, or run an action by name.
- **Session restore**: your spaces and tabs come back after a restart; tabs load only when you open them.
- **Light on memory**: at most 8 tabs stay loaded, and tabs you haven't used for 30 minutes rest until you come back.
- **Familiar shortcuts**: Ctrl+W close tab, Ctrl+Tab and Ctrl+Shift+Tab for recent tabs, Ctrl+1–8 for Swatches, Ctrl+9 for the last tab, Ctrl+R or F5 to reload, Ctrl+Shift+R to reload without the cache, Alt+← and Alt+→ for back and forward, Esc to stop loading, F12 or Ctrl+Shift+I for developer tools, and Ctrl+Shift+C to copy the page link (a small note confirms it).
- **Reopen closed tabs** with Ctrl+Shift+T, or from the sidebar's right-click menu: tabs come back where they were, up to 25 deep, even after a restart.
- **Mute a tab**: a speaker appears on tabs that play sound; click it, or use the tab's menu, to mute. A muted tab stays muted.
- **Local development tabs**: pages on localhost get a small "dev" label and are never put to rest, so the build you're reviewing keeps its state.
- **Memory readout**: "Ezel is carrying ~N MB" at the bottom of the sidebar, with the heaviest tabs listed when you hover it.
- **Squint and Greyscale lenses** (Ctrl+Alt+S and Ctrl+Alt+G, or from the command palette): blur the page to check its hierarchy, or remove colour to check it still works. Lenses stay on while you browse in that tab.

### Changed
- **Quiet by default**: Ezel doesn't offer to save passwords or autofill forms, turns down websites' requests to send notifications without asking you, and doesn't let videos play sound until you've clicked the page.
- Google is the default search engine and home page.

### Fixed
- The memory readout could crash Ezel when the sidebar appeared. It no longer can, and if a reading fails it keeps showing the last one (it hides after 15 seconds without a new one).

### Known issues
- **Windows only for now.** On macOS and Linux, mute, developer tools, copying the page link, the memory readout and rounded page corners don't work yet.
- **Everyday basics still to come**: the downloads button doesn't open anything yet, and there's no find in page, zoom, history, print, private window, bookmark import, website right-click menu, or creating new folders.
- **Fullscreen video and error pages** may not look right: video fullscreen may not fill the window, and failed pages show the plain default error screen.
- **Passwords and autofill are off on purpose** until Ezel has its own passwords screen (passwords saved earlier still fill in). Notifications are always declined, and other permission requests (camera, location) use a basic prompt.
- **Lens shortcuts on some keyboards**: on layouts that use AltGr (for example Polish or German), Ctrl+Alt+S and Ctrl+Alt+G can stop you typing the character on those keys.
- **Sign-in popups** (such as "Sign in with Google") open in a plain separate window without Ezel's shortcuts or quiet defaults.
- **Privacy**: the command palette fetches site icons from Google as you type an address, so Google sees the sites you type.
- **Safety hardening still to do**: Ezel's cookies and logins are stored under a generic folder name other test apps can share, Ezel's own interface has no content security policy yet, and local file addresses (file://) can be opened from the address field.
