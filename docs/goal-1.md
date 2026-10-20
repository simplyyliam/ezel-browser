Read CLAUDE.md, docs/ezel-vision.md and docs/browser-basics.md first. You are running unattended: I am
not here to answer questions. Work through the features below IN ORDER, one branch per feature, and
merge each into main only when every check passes.

WORKFLOW FOR EACH FEATURE
1. git checkout main && git pull is not needed (local only). Create the branch named below from main.
2. Backend first (src-tauri), then frontend (src). Follow CLAUDE.md: bindings via tauri-specta (add every
   new command and event to the collect list; never edit src/shared/bindings.ts by hand), Base UI not
   Radix, widgets/features folder convention, the store as the single source of truth, nothing drawn past
   the sidebar's right edge (the website webview covers it).
3. Tests: add Rust unit tests for every new model/logic piece. For frontend logic that can be tested
   without a window (hotkey maps, formatting, reducers), add tests if a test runner exists; if none exists,
   don't add one, just note it.
4. Checks, all must pass: cargo check, cargo clippy --all-targets (no warnings), cargo test, tsc -b,
   vite build, and the existing lint. Also: grep -rn "@tauri-apps/api/core\|@tauri-apps/api/event" src
   must only match src/shared/bindings.ts.
5. Commit with Conventional Commits (feat:, fix:, refactor:, test:, docs:, chore:). Small commits are fine.
6. Merge: git checkout main && git merge --no-ff <branch> -m "merge: <branch>", then
   git tag goal-<short-name>. Delete the merged branch with git branch -d.
7. If a check fails and you can't fix it within reasonable effort, or the feature needs a decision you
   can't make safely: do NOT merge. Commit the work on its branch, write down why, return to main and
   continue with the next feature. Never leave main broken.

HARD RULES
- Never write files outside the repo and Ezel's own app-data folder. Never touch other apps' folders.
  Before any new code writes to disk for the first time, log the exact path in your report.
- Never run two Ezel instances. Only run npm run tauri dev if no other instance is running; if you do,
  stop it before moving on. You cannot see the window, so never claim something "looks right".
- Don't rewrite history (no rebase on main, no force, no reset of main). Don't delete tags.
- Don't add dependencies unless the feature truly needs one; list any you add.
- Don't change existing behaviour outside the feature, and don't redesign existing UI.
- Ask nothing. When a choice is needed, pick the most conservative option, note it under
  NEEDS YOUR DECISION, and continue.

FEATURES (in order)

1. feat/hotkeys-pack
   Add to HOTKEYS (shared/hotkeys.ts; forwarding already exists): Ctrl+W close tab, Ctrl+Tab and
   Ctrl+Shift+Tab switch tabs in most-recently-used order within the space, Ctrl+1..8 activate Swatch
   1..8, Ctrl+9 last tab in the space, Ctrl+R and F5 reload, Ctrl+Shift+R hard reload, Alt+Left/Right
   back/forward, Esc stops loading, F12 and Ctrl+Shift+I open DevTools for the shown tab (if WebView2
   DevTools can be opened through wry or webview2-com; otherwise skip and note it), Ctrl+Shift+C copies
   the shown tab's URL with a small toast (use the existing toast if any; otherwise a minimal one inside
   the sidebar area). Respect the existing Ctrl+T/L/B. Document every shortcut in CLAUDE.md.

2. feat/reopen-closed-tab
   Backend: a closed-tab stack (max 25, persisted with the session) recording URL, title, favicon, space,
   folder and position. Command reopen_closed_tab restores the last one into the same space and position
   (or the end of the list if that position no longer exists), and switches to it. Temp tabs and pinned
   tabs both go on the stack when closed; a pinned tab that was only unloaded does NOT. Trash-all pushes
   its tabs too. Hotkey Ctrl+Shift+T. Add "Reopen closed tab" to the existing sidebar right-click menu.
   Rust tests for the stack rules and persistence.

3. feat/mute-tab
   Backend: mute/unmute per tab via WebView2 (IsMuted), state in the model and the state event. Frontend:
   a speaker icon on the tab row while audio plays (audio state already exists), click to toggle mute;
   muted shows a crossed speaker. Add Mute/Unmute to the tab context menu.

4. feat/localhost-tabs
   Tabs whose URL host is localhost, 127.0.0.1, [::1] or *.localhost are "dev tabs": never unloaded by the
   LRU or idle unloader, and shown with a tiny "dev" dot or badge on the row. Rust tests for the unload
   exemption.

5. feat/quiet-defaults
   Turn off WebView2 password autosave and general autofill for now (a TODO says a passwords UI comes
   later). Deny web notification permission by default without prompting. Block autoplay with sound if
   WebView2 exposes a setting for it; if not, skip and note it. Note each setting and how you applied it
   in decisions.md.

6. feat/load-meter
   Backend: a command that returns per-tab and total memory as best WebView2 allows (mark approximate or
   shared numbers as approximate). Frontend: a small, quiet "Ezel is carrying ~N MB" readout in the bottom
   actions area, refreshed every few seconds only while the sidebar is visible; a tooltip lists the top
   tabs. Unloaded tabs show as resting. Never block the UI on this call.

7. feat/lenses-squint-greyscale
   Build ONE reusable "inject into page" path in the backend (inject or remove a named CSS layer in the
   shown tab, re-applied on navigation while active). Use it for two lenses: Squint (blur) and Greyscale.
   Lenses are per tab and turn off when you switch tabs unless toggled again. Hotkeys: Ctrl+Alt+S squint,
   Ctrl+Alt+G greyscale. Also add both to the command palette (Ctrl+K) as actions. Document the inject
   path in CLAUDE.md, since later tools (Loupe, Palette Pull) will reuse it.

STOP when all features are done or skipped, or if main ever fails its checks and you can't fix it in one
attempt (then stop and report; don't continue on a broken main).

FINAL REPORT
Write docs/goal-report-1.md and also print it, containing:
- STATUS: per feature, merged / skipped / left on branch, with the tag name and one line on what it does.
- CHECKS: the final results of every check on main.
- MANUAL TESTS: a short checklist per merged feature that I must test in the running app (exact steps).
- NEEDS YOUR DECISION: every choice you made on my behalf, every skipped item and why, every new
  dependency, and every file path the app now writes to.
Update docs/browser-basics.md: tick the items you completed.