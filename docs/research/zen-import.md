# Importing from Zen (v0.3.0)

How Zen stores spaces, Essentials, pinned tabs and folders, from its open-source repo (zen-browser/desktop, branch `dev`, read 2026-10-23). Ezel reads a copy; it never writes to Zen's profile.

## Where
- Profiles: `%APPDATA%\zen\profiles.ini` (Firefox's format). The default profile is the `[Install…]` section's `Default=`, else the `[Profile…]` with `Default=1`, else the first; `Path=` is relative to `%APPDATA%\zen` when `IsRelative=1`.
- Session: `<profile>\zen-sessions.jsonlz4` (`ZenSessionManager.sys.mjs`, `FILE_NAME`), Zen's own file for "the sidebar": tabs, groups, folders, spaces and split views, shared by every window. Older builds (before the file existed) keep the same data per window in Firefox's `sessionstore-backups\recovery.jsonlz4` (`windows[0]`), which Ezel reads as a fallback.
- Format: Mozilla LZ4: the 8 bytes `mozLz40\0`, the decompressed size as a 4-byte little-endian number, then one LZ4 block. Zen rewrites the file on exit, so Ezel copies it first (into its own app-data folder) and reads the copy; a copy that fails because the file is locked means Zen is busy with it: close Zen and try again.

## Shape (the parts Ezel uses)
- `spaces[]`: `{ uuid, name, icon, position, containerTabId, theme }`. `icon` is an emoji or a `chrome://…/zen-icons/selectable/<name>.svg` path.
- `tabs[]`, in sidebar order: Firefox's tab state (`entries[]` with `url` and `title`, `index` 1-based into them, `image` = favicon, `pinned`, `groupId`) plus Zen's (`TabState-sys-mjs.patch`): `zenWorkspace` (the space's uuid), `zenEssential` (Essentials are global; they're also `pinned`), `zenIsEmpty` (Zen's placeholder tab), `zenIsGlance` (a Glance preview), `zenStaticLabel`.
- `folders[]` (`ZenFolders.mjs`, `storeDataForSessionStore`): `{ id, name, collapsed, pinned, essential, parentId, prevSiblingInfo, workspaceId, splitViewGroup, isLiveFolder }`. A tab is in a folder when its `groupId` is the folder's `id`; folders nest through `parentId`.

## Ezel's mapping
- Each chosen Zen space becomes an Ezel space (name trimmed to 40 characters; icon: the svg's name when it's one of Ezel's lucide icons, else Ezel's default).
- Essentials become Swatches in their order, while free slots last (8 in all); the rest become pinned tabs of the first imported space.
- Pinned tabs and folders keep their order; Ezel's folders are one level, so a nested folder becomes its own folder right after its parent. Split views and live folders become plain folders of their tabs. Unpinned tabs become temp tabs (newest first, as Zen lists them).
- Skipped: Zen's empty placeholder tabs, Glance previews, and any address Ezel can't open (only `http`, `https`; `url_policy`). Everything comes in unloaded (nothing loads until it's opened).
- Not imported: logins, passwords, cookies, history, containers, themes. Logins and cookies live in Firefox's encrypted stores; they stay in Zen.

Sources: https://github.com/zen-browser/desktop/blob/dev/src/zen/sessionstore/ZenSessionManager.sys.mjs, …/src/zen/folders/ZenFolders.mjs, …/src/browser/components/sessionstore/TabState-sys-mjs.patch and SessionStore-sys-mjs.patch; mozlz4: https://searchfox.org/mozilla-central/source/toolkit/components/lz4/lz4.js.
