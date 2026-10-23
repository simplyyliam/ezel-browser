# Browser basics

A study of Zen, Arc and Dia: the features Ezel needs to be a browser common users can use comfortably. These are the familiar, everyday features; the unique designer-focused features come after.

The study is based on how those three browsers behave, checked against Ezel's code: its command list, `src/shared/menus/catalog.ts`, and the many menu items marked `needs-backend` there.

Progress is marked inline: ✅ done, ◐ partly done (what's left is said). Goal 1 (2026-10-20, report: `docs/goal-report-1.md`) did the first step of the build order; v0.3.0 (2026-10-23, report: `docs/releases/v0.3.0-report.md`) did most of steps 2 to 5.

Ezel already has the hard architectural parts: spaces, pinned tabs, folders, Swatches, tab unloading, session restore, the command palette and the peek sidebar. What's missing is mostly the everyday basics that Chrome, Zen, Arc and Dia all share. Most items map to an existing WebView2 API, so the hook is named where one exists.

## Tier 1: Without these, people leave in the first hour

| # | Feature | What users expect | Ezel today | WebView2 hook |
|---|---|---|---|---|
| 1 | ✅ **Downloads** | Progress, open, show in folder, cancel, a list; ask where to save or use a default folder | ✅ v0.3.0: Ezel's own list behind the footer button (progress, open, show in folder, cancel, clear), WebView2's flyout off; the Windows Downloads folder (a page's Save As still asks). Left: pause/resume, a choice of folder (Settings) | `DownloadStarting`, `DownloadOperation` |
| 2 | ✅ **Find in page** (Ctrl+F) | Bar with match count, next/previous, Esc closes | ✅ v0.3.0 (WebView2's find; needs a 2025+ runtime) | `ICoreWebView2Find` (or JS fallback) |
| 3 | ✅ **Website context menu** | Open link in new tab, copy link, copy/save image, copy, paste, search selection, inspect | ✅ v0.3.0: Ezel's own menu (catalog items marked built). Left: the designer items (Pick Color, Capture, Copy Palette…), Save Page As, Print, View Source | `ContextMenuRequested` (draw your own, which suits the design) |
| 4 | ◐ **Standard shortcuts** | Ctrl+W, Ctrl+Shift+T, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1…9, Ctrl+R/F5, Ctrl+Shift+R, Alt+←/→, Ctrl+D, Ctrl+P, Ctrl+F, Ctrl+±/0, F11, F12, Ctrl+Shift+C (copy URL, Arc/Zen), Esc stops loading | ◐ All of them except Ctrl+P, Ctrl+±/0 and F11 (their features don't exist yet); Ctrl+F and Ctrl+D (pin) since v0.3.0 | `HOTKEYS` + forwarding is already built |
| 5 | ✅ **Reopen closed tab** | Ctrl+Shift+T, several levels deep, restored into the right space and spot | ✅ 25 deep, persisted, back in its space/folder/swatch slot; also in the sidebar menu | Model: closed-tab stack |
| 6 | **Page zoom** | Per-site zoom that's remembered, an indicator, reset | None | `ZoomFactor` |
| 7 | ✅ **HTML fullscreen** | YouTube and video fullscreen fills the whole window and hides the sidebar and titlebar | ✅ v0.3.0 (Esc or the site's button returns) | `ContainsFullScreenElementChanged` |
| 8 | ✅ **Site permissions** | Prompts for camera, mic, location, notifications, clipboard, with per-site memory | ✅ v0.3.0: Ezel's prompt in the titlebar peek for camera, microphone, location and clipboard, remembered per site, listed and revocable; notifications still declined without a prompt. Other kinds (MIDI, sensors…) keep WebView2's prompt | `PermissionRequested` |
| 9 | ◐ **Passwords and autofill** | Save and fill logins, addresses and cards | ◐ Both turned off on purpose until a passwords UI exists | `IsPasswordAutosaveEnabled`, `IsGeneralAutofillEnabled` |
| 10 | ✅ **Error and crash pages** | Offline, DNS, SSL warning, "page crashed, reload" | ✅ v0.3.0: Ezel's own pages; SmartScreen's warnings stay WebView2's | `NavigationCompleted` errors, `ProcessFailed`, `ServerCertificateErrorDetected` |
| 11 | ✅ **Mute tab and audio indicator** | Speaker icon on the row, click to mute | ✅ Speaker on the row (waves while playing, crossed when muted), Mute/Unmute in the tab menu | `IsMuted` |
| 12 | **Default browser** | Register as a Windows handler, open links from other apps into a new tab in a running Ezel (single instance) | None | Registry + `tauri-plugin-single-instance` |

## Tier 2: Expected within the first week

| # | Feature | Notes from Zen / Arc / Dia |
|---|---|---|
| 13 | **History** | A searchable list (Ctrl+H), long-press or right-click Back/Forward for the list (in the catalog), clear browsing data. History also feeds the palette. |
| 14 | **Palette suggestions** | History, bookmarks and Google autocomplete in the command palette. Today it only knows open tabs, so this is the biggest gap in daily feel. |
| 15 | ◐ **Bookmarks** | In Arc and Zen, pinned tabs and Swatches *are* the bookmarks, so Ezel already has the model. ✅ Ctrl+D pins (v0.3.0). ✅ Import from Zen (v0.3.0); Chrome/Edge/Arc import: v0.6.0 (`docs/research/browser-import-formats.md`). |
| 16 | **Import from Chrome/Edge** | Bookmarks, history, passwords (via CSV). Arc's onboarding import is a big reason people try it. |
| 17 | **Settings page** | Search engine, homepage/new tab, downloads folder, theme, shortcuts (already planned), clear data, default browser, permissions per site. |
| 18 | **Private window** | Ctrl+Shift+N. Arc and Zen both have one. In WebView2 it's a separate profile with `IsInPrivateModeEnabled`. |
| 19 | **Print / Save as PDF** | Ctrl+P. `ShowPrintUI`, `PrintToPdf`. |
| 20 | ✅ **Site info / lock icon** | Connection secure, certificate, permissions and cookies for this site. ✅ v0.3.0: the domain and lock in the titlebar peek; clicking opens the site panel there (connection, permissions, Clear This Site's Data). |
| 21 | **Extensions** | Ad blocker and password managers (1Password, Bitwarden) are the deal-breakers. WebView2 can load unpacked extensions (`AreBrowserExtensionsEnabled`, `AddBrowserExtension`) but has no Web Store install flow. At minimum, build in an ad blocker (Arc and Dia ship one, Zen relies on uBlock). |
| 22 | **Picture-in-picture** | Arc auto-PiPs video when you switch tabs; users love it. |
| 23 | **Notifications** | Web notifications become Windows toasts. `NotificationReceived`. |
| 24 | ✅ **DevTools** | ✅ F12 / Ctrl+Shift+I open the page's DevTools (`OpenDevToolsWindow`); ✅ Inspect in the website menu (v0.3.0). |
| 25 | ✅ **Tab search / switch** | Already in the palette. Decided: Ctrl+Tab is most-recently-used order within the space (`docs/research/browser-shortcuts.md`). |

## Tier 3: What makes Zen, Arc and Dia feel modern (still not "designer" features)

- **Split view** (Arc, Zen, Dia): two or more tabs side by side. The multi-webview architecture is well suited to it.
- **Peek / Glance** (Arc Peek, Zen Glance): open a link in a floating preview over the current page, then expand or close it.
- **Little Arc / quick window**: links from other apps open in a small throwaway window instead of cluttering spaces.
- **Auto-archive temp tabs** (Arc archives after 12h, Zen has an unloader): temp tabs closing themselves, with an "Archive" to recover them.
- **Profiles per space** (Arc, Zen containers): separate logins per space, e.g. work and personal. WebView2 profiles make this doable.
- ✅ **Copy URL toast** (Ctrl+Shift+C, Arc and Zen): small, but everyone who's used either expects it.
- ✅ **Hover link preview in a status bar**: the bottom-left URL when hovering a link (v0.3.0, domain emphasised).
- **AI sidebar** (Dia's whole pitch: chat with the open tabs). Optional; better left for the unique phase.

## Suggested build order

1. ✅ Shortcuts pack + reopen closed tab + mute + copy URL (mostly UI work on systems that already exist)
2. ✅ Website context menu (unblocks about 15 catalog items)
3. ◐ Find in page ✅, zoom, HTML fullscreen ✅
4. ✅ Downloads (backend + list in bottom actions)
5. ✅ Error/crash pages, permissions prompts
6. History, then palette suggestions (history + Google autocomplete)
7. Default browser + single instance + external links
8. Settings page (gathers search engine, downloads folder, shortcuts, clear data, permissions)
9. Passwords UI, import, private window, print, DevTools, PiP, notifications
10. Extensions / ad block
11. Tier 3: split view, peek, auto-archive, profiles per space

## After the basics

The catalog already holds the start of the designer features (Pick Color, Copy as SVG, Copy Palette, Inspect Typography, Capture Page), so phase two has a ready starting point.
