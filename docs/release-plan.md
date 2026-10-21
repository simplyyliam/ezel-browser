# Ezel release plan

One release = one `/goal` run. Each release mixes three things:

- **Shine**: designer features that make Ezel feel like Ezel.
- **Basics**: everyday browser features people expect.
- **Safety**: security and privacy fixes from `docs/security-review.md`.

Releases are numbered from the last tag. v0.2.0 is out, so the next one is v0.3.0.

---

## How to run a release

1. On `main`, clean (`git status`), every Ezel window and dev server closed.
2. Fresh Claude Code session from the repo root.
3. Type `/goal` and a space yourself, then paste the release's goal text (at the bottom of each release section, without its leading `/goal`).
4. When it finishes: read `docs/releases/vX.Y.Z-report.md`, then test with its MANUAL TESTS in one fresh `npm run tauri dev`.
5. Something broken? Fix it on a branch and merge. Then move the tag onto the latest commit (it isn't pushed yet, so this is safe): check the message with `git tag -l -n1 vX.Y.Z`, then `git tag -f -a vX.Y.Z -m "<same message>"`.
6. All good: run `npm run release` (it pushes main and the tag), wait for the GitHub Action to build the installers, then open the draft on GitHub's Releases page, check it, and publish it.

If a run stops partway (usage, restart), run the same goal again in a fresh session. It continues from what's already merged.

---

## Rules for every release goal

The agent follows these in every release. They're the lessons from earlier goals.

**Workflow**

- Work through the release's features in the order listed. One branch per feature from `main` (`feat/…`, `fix/…`, `chore/…`).
- Backend first (`src-tauri`), then frontend (`src`).
- Merge into `main` with `--no-ff` only when every check passes. Delete the merged branch.
- If a feature fails its checks or needs a decision you can't make safely: leave it committed on its branch, write down why, return to `main` and continue. Never leave `main` broken.
- Never ask me anything. Pick the most conservative option, note it under NEEDS YOUR DECISION, continue.
- Don't rewrite history on `main`. No rebase, no force, no reset. Don't push anything.
- Don't revisit features from earlier releases unless the release lists them. If something listed already partly exists, finish it rather than rebuilding it.
- Research is allowed but brief. Save findings in `docs/research/` (one short file per topic, with sources). Reuse what's already there, e.g. `docs/design/drag-and-drop.md`.

**Checks (all must pass before each merge)**

- `cargo check`, `cargo clippy --all-targets` (no new warnings), `cargo test`
- `tsc -b`, `vite build`, the lint (no new warnings)
- `grep -rn "@tauri-apps/api/core\|@tauri-apps/api/event" src` matches only `src/shared/bindings.ts`
- Rust unit tests for every new model or logic piece, including failure paths

**Project rules (from CLAUDE.md)**

- Bindings via tauri-specta. Add new commands and events to the collect list. Never edit `bindings.ts` by hand.
- Base UI, never Radix. widgets/features folder convention. The store is the single source of truth.
- Nothing drawn past the sidebar's right edge: the website webview covers it. Overlays on a page are injected into the page, never drawn by the UI over it.
- Match the designs in `docs/design/` where one exists for the feature.
- Standard browser conventions stay identical (shortcuts, menu wording, core behaviour). Visuals, motion, wording and small details are Ezel's own. Never copy another product's visual design, icons or copy.
- Respect `prefers-reduced-motion`. Reuse the titlebar's easing and timing.

**Safety**

- Websites in tabs must never reach Tauri commands or events. Keep `websites_in_tabs_cannot_reach_ipc` passing.
- Validate every command input in Rust. Navigation stays limited by `browser/url_policy.rs`.
- Anything injected into pages runs isolated, never built from page content, and sends data back only through an explicit, validated channel.
- Never log URLs, page content or personal data. No telemetry, no network calls of our own unless the feature needs one (name it in the report).
- Write files only inside Ezel's app-data folder, atomically. Never overwrite a file you didn't create.
- WebView2 / COM code: keep every owning object alive while anything derived from it is used (the load-meter crash). Check every result. Document every `unsafe`.
- Don't turn off SmartScreen, site isolation or the sandbox.

**Performance**

- No polling and no timers while idle. Tabs unload by default. Nothing new keeps a hidden tab awake unless it must (name it).
- At the end, if no Ezel instance is running: build a release, run `scripts/measure-memory.ps1`, compare with `docs/perf/results.md`. Report the numbers. A regression over 10% is listed under NEEDS YOUR DECISION.

**Running the app**

- Never launch Ezel while another instance is running. You can't see the window, so never claim something looks right.

**Commits**

- Conventional Commits subject under ~70 characters, then at most 5 short bullets. No paragraphs. Merge commits: `merge: <branch>`.

**Release step (after all features)**

1. Check that `main` is clean and every check passes. If not, stop and report.
2. Bump the minor version (e.g. v0.2.0 to v0.3.0) in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock`, `package.json` and `package-lock.json`. Commit `chore(release): vX.Y.Z`.
3. Add a section to the top of `CHANGELOG.md`: Added, Changed, Fixed, Known issues (max 8, plain language), Privacy. Drop known issues that are now fixed. Commit `docs: add changelog for vX.Y.Z`.
4. Update `docs/browser-basics.md` (tick what's done) and `docs/security-review.md` (mark what's fixed).
5. Create an annotated tag on the latest commit: `git tag -a vX.Y.Z -m "<one-line summary>"`. Don't push.
6. Write `docs/releases/vX.Y.Z-report.md`: STATUS (per feature: merged, skipped or left on a branch, one line each), CHECKS, MANUAL TESTS (exact steps per merged feature), NEEDS YOUR DECISION (every choice made for me, every skipped item, every new dependency, every new file path the app writes to), PERFORMANCE (the memory numbers). Commit it before tagging, so the tag stays on the latest commit.

---

## v0.3.0: Everyday and safe

Folders, the right-click menus and the everyday basics, plus knowing which site you're on.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Basics | **Folders** | Folders can be created from a tab's right-click menu ("New folder with this tab") and from the sidebar's empty area ("New folder"). Tabs can be dragged into and out of folders, following `docs/design/drag-and-drop.md` (the middle of a folder row drops into it; the top and bottom edges drop beside it). New folders start in rename mode. Rename, collapse, unpack and delete work from the folder's right-click menu. |
| 2 | Basics | **Sidebar context menus** | Every sidebar area has a complete right-click menu: swatch, pinned tab, temp tab, folder, space pill and empty area. Includes Move to space, Add to / Remove from Swatches, Pin / Unpin, Copy link, Reload, Duplicate tab and Delete space. Deleting a space asks whether to close its tabs or move them to another space (skipped when empty); the last space can't be deleted. Menus never extend past the sidebar's right edge. Finish what exists rather than rebuilding it. |
| 3 | Safety | **Site identity + quick tabs** | The titlebar peek's middle shows the current tab's domain with a lock (or a warning icon for http and certificate problems). The left side of the peek shows the current folder's other tabs as icons (clicking one switches to it; outside a folder it shows the Swatches). The command palette's top line shows the full current address, ready to edit. Sign-in popup windows show their domain in the window title. Only the domain is emphasised. Clicking the domain opens a small site info panel (inside the peek area, never past the sidebar's edge): connection and certificate status, this site's remembered permissions, and "Clear this site's data". Ctrl+D pins the current tab (Ezel's bookmark). |
| 4 | Basics | **Website context menu** | Ezel draws its own right-click menu for pages (WebView2 `ContextMenuRequested`): open link in new tab, copy link, copy image, save image, copy, paste, search selection, inspect. Keeps the catalog in `src/shared/menus/catalog.ts` and marks those items done. |
| 5 | Basics | **Find in page** | Ctrl+F opens a small bar inside the content area's top edge with a match count, next/previous (Enter / Shift+Enter) and Esc to close. |
| 6 | Basics | **Downloads** | A downloads list behind the existing bottom-actions button: progress, open, show in folder, cancel. Default folder is the Windows Downloads folder. Ezel's own list replaces WebView2's flyout. |
| 7 | Basics | **HTML fullscreen** | Video fullscreen fills the whole window and hides the sidebar and titlebar; Esc or the site's button returns to normal. |
| 8 | Basics | **Error and crash pages** | Ezel's own calm pages for offline, address not found, certificate error and "page crashed, reload". SmartScreen's own warning pages stay as they are. |
| 9 | Safety | **Site permissions** | Ezel's own prompt for camera, microphone, location and clipboard (WebView2 `PermissionRequested`), remembered per site, plus a simple list to review and revoke them. |
| 10 | Basics | **Recently closed tray + link status** | The command palette shows the last few closed tabs as small chips under its list (only when there are any); clicking one reopens it. Hovering a link shows its address in a small status pill at the content area's bottom-left. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.3.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.3.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.3.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## v0.4.0: The designer's eye

Ezel's signature tools. This is the release to post about.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Shine | **Loupe** | Hold a key and hover anything: font family, size, weight, line height, colour, spacing and radius in a small calm card. Injected into the page, reusing the lenses inject path. |
| 2 | Shine | **Pick Color** | A full-window eyedropper with a magnifier. Click copies the colour; a small menu offers HEX, RGB, HSL and OKLCH. Shortcut and palette action. |
| 3 | Shine | **Palette Pull** | One action pulls the page's colours, grouped and de-duplicated, swatches dropping in one by one. Export as CSS variables, Tailwind config, JSON or .ase. |
| 4 | Shine | **Copy as…** | Any colour, palette or type style can be copied as CSS, Tailwind, JSON or plain Figma-friendly text, from Loupe, Pick Color and Palette Pull. |
| 5 | Shine | **Type Report** | Every font family, size and weight on the page as a clean type scale, with where each font comes from. |
| 6 | Shine | **Contrast check** | Pick a text and a background colour (or hover text) and see the WCAG ratio with AA and AAA pass or fail. Palette action. |
| 7 | Shine | **Capture** | Visible area, full page or a single element. Saved to a folder and copied to the clipboard. |
| 8 | Shine | **Lens menu** | One key opens the lenses: squint, greyscale, wireframe (outlined boxes, hidden images, grey text), colour-blindness simulations, dark/light forcing, reduced motion and slow-network throttle. Lens shortcuts avoid Ctrl+Alt (AltGr keyboards). |
| 9 | Shine | **Sleepy tabs** | Unloaded and frozen tabs dim slightly in the sidebar, with a soft breathing dot. Static under reduced motion. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.4.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.4.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.4.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## v0.5.0: Collect and remember

Pinterest inside the browser, history, and the mini player.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Shine | **Shelf** | A moodboard panel in the sidebar per space. Drag images, captures and colours onto it; a new clip pins on with a tiny bounce. |
| 2 | Shine | **Clips that remember** | Every clip stores its URL, page title, date, palette and fonts. Clicking a clip's source reopens the page. |
| 3 | Shine | **Search by colour** | Find clips by dominant colour and by local auto-tags (site, colour, capture type). No AI needed. |
| 4 | Shine | **Rediscover** | The new tab page softly shows one random clip from your shelf. |
| 5 | Shine | **Mini player** | Switching away from a playing video shrinks it into a small player inside Ezel's window, with a pop-out button for the normal desktop picture-in-picture. Never frozen or unloaded while playing, muted or not. |
| 6 | Basics | **History** | Ctrl+H opens a searchable history. Clear browsing data (history, cookies, cache). |
| 7 | Basics | **Palette suggestions** | The command palette suggests from history and open tabs as you type. |
| 8 | Safety | **Private favicons** | Site icons come from the site itself (cached locally), not from Google. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.5.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.5.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.5.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## v0.6.0: Settle in

Everything that makes Ezel easy to switch to and live in.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Shine | **Easel unfold** | First launch plays a short easel-unfolding animation, then a calm welcome that offers import and creates your first space. Skipped under reduced motion. |
| 2 | Basics | **Import from Chrome and Edge** | Bookmarks (as pinned tabs) and history. |
| 3 | Basics | **Settings page** | Search engine, downloads folder, theme, clear data and shortcuts, in one standalone page. Includes a switch to turn off search suggestions, so nothing you type in the palette is sent to the search engine until you press Enter. |
| 4 | Basics | **Passwords and autofill** | Turn WebView2's password saving and autofill back on, with a passwords page in settings to see, copy (after Windows Hello or the account password) and delete saved logins. Off by default until the page exists. |
| 5 | Basics | **Page zoom** | Ctrl+plus, minus and 0, remembered per site, with a small indicator while zoomed. |
| 6 | Basics | **Private window** | Ctrl+Shift+N opens a separate private profile that leaves no history or cookies. |
| 7 | Basics | **Default browser** | Ezel can register as a Windows browser; links from other apps open in the running Ezel (single instance). |
| 8 | Safety | **Data cleanup** | Old data in the shared `com.tauri.dev` folder is never read; settings can clear everything Ezel stores. The session file is written with restricted permissions. |
| 9 | Safety | **Updates** | Signed auto-updates through Tauri's updater, using this repo's GitHub releases, with a calm "update ready" note. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.6.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.6.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.6.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## v0.7.0: Build and review

For design engineers checking their work.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Shine | **Tracing Paper** | Drop an image (e.g. a Figma export) onto a page at 50% opacity. Nudge with arrow keys, toggle difference mode. |
| 2 | Shine | **Viewport presets** | The palette resizes the page to common widths (375, 768, 1280, 1440) and back. |
| 3 | Shine | **Grid and ruler** | A configurable column grid overlay, and drag-to-measure with spacing shown between elements. |
| 4 | Basics | **Glance** | Shift+click opens a link in a floating preview card; close it or turn it into a tab. |
| 5 | Basics | **Split view** | Two tabs side by side with a draggable divider. |
| 6 | Basics | **Print and save as PDF** | Ctrl+P. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.7.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.7.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.7.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## v0.8.0: Make it yours

Personality and community.

| # | Type | Feature | Done when |
|---|---|---|---|
| 1 | Shine | **Paints** | UI colour themes and per-space tints, stored as data (JSON tokens). |
| 2 | Shine | **Glaze** | Per-site style: change colours and fonts, and hide elements, saved per site. Advanced users can add CSS. |
| 3 | Shine | **Sharing** | Export and import Paints and Glazes as small `.ezel` files, previewed before applying. |
| 4 | Shine | **Toolbox and Studio mode** | Turn tools on and off and pick their shortcuts; Studio mode shows the design tools, Browse mode hides them all. |
| 5 | Shine | **Donkey moments** | A few rare, hidden touches, e.g. the memory readout at rest says "Ezel is resting". Never in the way. |
| 6 | Basics | **Content blocking** | Built-in ad and tracker blocking from a filter list, with a per-site off switch. |
| 7 | Safety | **Glaze guardrails** | Shared Glazes are CSS only: no JavaScript, no `@import`, no remote `url()`. One-click "disable all Glazes". Never applied to Ezel's own pages. |
| 8 | Safety | **Stricter CSP** | Inline styles in Ezel's UI use a nonce instead of `unsafe-inline`. |

```
/goal Follow docs/release-plan.md: read it fully, plus CLAUDE.md, docs/ezel-vision.md, docs/browser-basics.md and docs/security-review.md. Build every feature in the "v0.8.0" section in order, following "Rules for every release goal". Never ask me anything. The goal is done when every v0.8.0 feature is merged or skipped (with the reason written down), the "Release step" is complete with an annotated local tag, and docs/releases/v0.8.0-report.md exists with STATUS, CHECKS, MANUAL TESTS, NEEDS YOUR DECISION and PERFORMANCE.
```

---

## Later

Ideas from the vision doc that wait until the releases above show what people use.

**Later:** Devices view (synced viewports), Asset Grab, annotate captures, spec card, revisit snapshots, board export, font swap and palette swap, visual diff, Little Ezel, profiles per space, auto-archive temp tabs, notifications, keyboard dragging for tabs (accessibility), code signing the installer (removes the SmartScreen "unknown publisher" warning; costs money yearly, so only once people use Ezel).

**Maybe:** reader view, stack sniff, live palette strip, Focus Space, inspo feed (own sources only), Copy to Figma, optional sounds, WebView2 extensions as a hidden power-user flag, Ezel Tools SDK.
