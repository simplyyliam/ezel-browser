# Importing from Arc, Chrome, Edge and Dia (for v0.6.0)

Researched 2026-10-23 during v0.3.0 (asked for while building the Zen importer), so v0.6.0's "Import from Arc, Chrome and Edge" can reuse the Zen flow: find the profile, copy its files into Ezel's `import/` folder, read the copy, show what's there, let people choose, apply a plan through `Model::add_tab` / `create_space` / `create_folder` (`browser/zen_import.rs`, `apply`). Never write to the other browser's files; nothing loads until opened. Unverified details are marked.

## Chrome and Edge (Chromium)
- Profiles: `%LOCALAPPDATA%\Google\Chrome\User Data\` and `%LOCALAPPDATA%\Microsoft\Edge\User Data\`; one folder per profile (`Default`, `Profile 1`…). `User Data\Local State` (JSON) lists them under `profile.info_cache` with display names; `profile.last_used` is the one to offer first. *(Key names from memory of Chromium; check against a real file.)*
- **Bookmarks**: `<profile>\Bookmarks`, JSON (Chromium's `bookmark_codec.cc`): `roots.bookmark_bar`, `roots.other`, `roots.synced` (mobile), each a folder node `{ type: "folder", name, children[] }`; links are `{ type: "url", name, url, date_added }`; `checksum` and `version` at the top. Plain file, readable while the browser runs. Mapping for Ezel: one space ("Chrome" / "Edge"), the bookmarks bar's links as pinned tabs, its folders as folders (nested ones flattened like Zen's), Other bookmarks as one more folder.
- **History**: `<profile>\History`, SQLite (`urls`: `url`, `title`, `visit_count`, `last_visit_time` in microseconds since 1601). Locked while the browser runs: copy the file (and `History-journal`/`-wal`) first, then open the copy read-only. Needs an SQLite reader (`rusqlite` with the bundled feature) — a new dependency for v0.6.0, and only once Ezel has history (v0.5.0).
- **Open tabs**: `<profile>\Sessions\Session_*` / `Tabs_*`, Chromium's binary SNSS command log. Hard to read and changes between versions: leave open tabs out (Edge's own "import from Chrome" does too).
- **Passwords and cookies**: encrypted with DPAPI plus app-bound encryption (Chrome 127+), on purpose not readable by other apps. Not imported; offer "export passwords as CSV in Chrome, then import the CSV" when Ezel has a passwords screen (v0.6.0's Passwords item).
- Favicons: `<profile>\Favicons` (SQLite); Ezel can just fetch them again when a tab loads.

## Arc (Windows)
- Not under `%LOCALAPPDATA%\Arc` for Store installs: `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_<suffix>\LocalCache\Local\Arc\` (the suffix varies: look for a `TheBrowserCompany.Arc_*` folder). Its Chromium profile is under `User Data\` there; the sidebar is a separate file next to it: **`StorableSidebar.json`**.
- Shape (from the open-source `arc-export` tool): `sidebar.containers[]`; the container after the one holding `global` has `spaces[]` and `items[]`. A space: `{ id, title, newContainerIDs: ["pinned", <id>, "unpinned", <id>, …] }` (markers followed by the container id). `items[]`: `{ id, parentID, childrenIds[], title, data: { tab: { savedURL, savedTitle } } }`; an item without `data.tab` is a folder. Favorites (Arc's Swatches) are the global container's `topAppsContainerIDs` *(field name unverified)*.
- Mapping: Arc space → Ezel space; pinned container's items → pinned tabs and folders in order; Favorites → Swatches; Today (unpinned) tabs → temp tabs. Split views, Easels, Notes and Boosts have no Ezel equivalent: skipped and said so.
- Quit Arc before reading (a copy taken mid-write can be cut off); parse errors then mean "close Arc".

## Dia
- The Browser Company's newer, Chromium-based browser. No public documentation of where it keeps data on Windows (it launched for macOS first; a Windows build may not exist yet when v0.6.0 starts). Treat it like Chrome if its `User Data\<profile>\Bookmarks` exists (look under `%LOCALAPPDATA%\TheBrowserCompany\Dia` or a `Packages\TheBrowserCompany.Dia_*` folder: *unverified guesses*). Check on a real install before building it.

## Zen
Built in v0.3.0: docs/research/zen-import.md.

Sources: https://chromium.googlesource.com/chromium/src.git/+/main/components/bookmarks/browser/bookmark_codec.cc, https://uwyo.teamdynamix.com/TDClient/1940/Portal/KB/ArticleDet?ID=75135 (Chrome bookmarks path), https://github.com/ivnvxd/arc-export (`main.py`: StorableSidebar.json parsing), https://github.com/iamfitsum/arc-export-windows and https://supasidebar.com/blog/export-arc-browser-sidebar (Arc's Windows path), https://contextbolt.com/blog/export-arc-bookmarks/ (what survives an Arc export).
