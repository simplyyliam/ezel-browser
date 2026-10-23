# Security review before a public release

Review 2026-10-21 (`chore/security-check`), fixes 2026-10-21 (`chore/security-fixes`) and v0.3.0 (2026-10-23). Fixed items first; open risks stay ranked by severity.

## Fixed

### 1. Websites can't reach Tauri IPC (verified, guarded by a test) — `chore/security-check`
Tauri lets a command or event call through only when a capability matches **both** the calling webview's label and its origin (`tauri/src/ipc/authority.rs`, `resolve_access`).
- The only capability (`src-tauri/capabilities/default.json`) is scoped to `"webviews": ["ui"]`. It names no window (the window `main` also holds every tab, so a window-scoped capability would include them) and no `remote` URLs (so a page from `https://…` never matches, whatever its label).
- Tab webviews are labelled `tab-<id>` (`browser/mod.rs`), never `ui`.
- Every command is declared in the app manifest (`build.rs`), so the ACL applies to all of them; events need `core:event` permissions, which only that capability grants.
- `tests::websites_in_tabs_cannot_reach_ipc` (`src-tauri/src/lib.rs`) fails if any of this changes: a second capability file, a window or remote scope, a capability list in `tauri.conf.json`, a tab label equal to `ui`, or a command missing from the app manifest (checked: removing one from `build.rs` fails the test).

### 2. Tabs load only `http`, `https` and `about:blank` (+ a page's own `blob:`) — `chore/security-check`, `chore/security-fixes`
One rule, `browser/url_policy.rs` (tested), checked everywhere an address can reach a tab:
- typed input (`navigate`, `open_tab`, the palette, the tab-name field): `file:`, `javascript:`, `data:`, `vbscript:`, `blob:` and `about:` pages other than `about:blank` are refused (`invalid_input`); the palette offers only a search for them, the name field shows "Only web addresses can be opened";
- every navigation a page starts (links, redirects, `location = …`, form posts): cancelled by `on_navigation` unless allowed, or a `blob:` of a web origin (`blob:https://…`, `blob:http://…`: a PDF, image or download preview the page generated) via `is_allowed_from_page`;
- new windows (`target=_blank`, `window.open`, sized popups): the same page rule. A tab a page opens carries a non-persisted `opened_by_page` mark so its first address may be that blob;
- restored sessions and tabs being reloaded after unloading: the strict rule (no `blob:`); an address that isn't allowed opens `about:blank`;
- reset to a pinned URL: skipped unless allowed (strict rule).
Not covered, on purpose: `javascript:` links a page puts in its own HTML run in that page's own context when clicked (Chromium executes them without a navigation). That's the page running its own code with its own rights, not an escalation; blocking it would break sites.

### 3. SmartScreen is on (was: High) — `chore/security-fixes`
`BROWSER_ARGS` no longer carries wry's default `msSmartScreenProtection` in `--disable-features`, so Microsoft Defender SmartScreen checks the sites and downloads people open in every webview. wry's two interface flags stay off (Edge's text-selection mini menu and Edge's PDF UI); no other security feature is disabled. `tests::browser_args_keep_smartscreen_on_and_block_autoplay_with_sound` fails if SmartScreen, site isolation or the sandbox is turned off in `BROWSER_ARGS`. What comes back for users: Edge's SmartScreen warning page on reported phishing/malware sites, and SmartScreen verdicts on downloads (see the release notes / NEEDS YOUR DECISION).

### 4. Ezel's UI has a Content Security Policy (was: High) — `chore/security-fixes`
`tauri.conf.json` `app.security.csp`, sent by Tauri as a header with the UI's HTML in release builds:

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | everything else: only Ezel's own bundle |
| `script-src` | `'self'` + Tauri's hash of the inline theme script in `index.html` | no inline or remote scripts; Tauri adds the hash at build time |
| `style-src` | `'self' 'unsafe-inline'` | the theme store creates `<style>` elements at runtime (token overrides, the one-frame transition switch-off); Motion and React `style` props use the CSSOM, which CSP doesn't restrict |
| `img-src` | `'self' data: https: http:` | favicons of any site, Google's favicon service for typed hosts, `data:` icons |
| `font-src` | `'self'` | the bundled Inter woff2 files only |
| `connect-src` | `'self' ipc: http://ipc.localhost` | Tauri IPC (Windows uses `http://ipc.localhost`) |
| `media-src` | `'self'` | |
| `object-src`, `frame-src`, `worker-src`, `base-uri`, `form-action` | `'none'` | nothing of the kind exists in the UI |

- `dangerousDisableAssetCspModification: ["style-src"]`: Tauri appends nonces/hashes to directives it modifies, and any hash in `style-src` makes browsers ignore `'unsafe-inline'`, which would break the runtime `<style>` elements. Script hashing stays on.
- `devCsp` adds Vite's dev server (`http://localhost:5173`, HMR over `ws://localhost:5173`, React refresh's inline preamble). On desktop Tauri loads the dev server directly and applies neither policy in dev (it injects CSP only into assets it serves), so dev mode is unaffected either way.
- Verified (no Ezel instance could be launched): the production `dist/` served with the exact header Tauri would send (including the inline-script hash, normalised CRLF→LF like Tauri's `normalize_script_for_csp`) in headless Edge (Chromium, as WebView2) with a stub of Tauri's internals so the real UI renders: no CSP violations from the UI; the theme script runs; a runtime `<style>` applies; Inter loads; remote and `data:` favicons load; an injected inline script is blocked (the policy is enforced). Not exercised there: real IPC over `ipc.localhost` (manual test).

### 5. Visible site identity (was: High) — v0.3.0 (`feat/site-identity`)
The titlebar peek shows the shown tab's host with a lock (an open lock for HTTP, a warning for certificate problems: `browser/site.rs`, `ServerCertificateErrorDetected` for the page's own host), only the registrable domain emphasised. The page can't change it. Sign-in popups (sized `window.open`) now open in Ezel's own window (`browser/popup.rs`, label `popup-<n>`, no IPC, same URL policy) titled with their domain first. Certificate errors show Ezel's page with no way past it. Left: the peek is hidden until hovered; the domain is a heuristic, not the Public Suffix List (`docs/research/site-identity.md`).

### 6. Permissions have a review screen (was: Medium) — v0.3.0 (`feat/site-permissions`)
Camera, microphone, location and clipboard requests get Ezel's prompt (naming the requesting host), only for the tab on screen; answers live in `<app data>/ezel/permissions.json` (never in WebView2's profile), listed in the site panel and Site Permissions, each revocable. Other kinds and sign-in popups keep WebView2's prompt (left).

### 7. Ezel's own downloads list (was: Medium) — v0.3.0 (`feat/downloads`)
Every download appears in Ezel's list (WebView2's flyout is off); SmartScreen still checks them. Opening a file uses Explorer, so Windows' own "file from the internet" warnings apply.

### 8. Updates reach installed copies (was: Medium, half) — v0.3.0 (`feat/auto-updates`)
Tauri's updater: release builds check GitHub daily, verify each update against Ezel's updater key (minisign; the private key only in GitHub Actions secrets) and install only on a click. The installer itself is still not code-signed (open risk 4).

## Open risks, by severity (not fixed)

1. ~~High: no visible site identity~~: fixed in v0.3.0 (Fixed 5). Left: the identity shows only while the titlebar peeks.
2. ~~Medium: permissions without a review screen~~: fixed in v0.3.0 (Fixed 6). Answers given before v0.3.0 to WebView2's own prompt stay in its profile until cleared (Clear This Site's Data clears the site's storage, not those grants).
3. ~~Medium: downloads are WebView2's defaults~~: fixed in v0.3.0 (Fixed 7).
4. **Medium: no code signing.** Updates now arrive and are signed with Ezel's updater key (Fixed 8), but the installer isn't Authenticode-signed, which trains people to click through Windows warnings. (The WebView2 runtime itself updates through Windows, which covers Chromium's security fixes.)
5. **Medium: DevTools in release builds.** F12 opens a page's DevTools for anyone at the keyboard, which makes "paste this into the console" scams easier. Common in browsers, but worth a setting.
6. **Low: `'unsafe-inline'` styles in the UI.** Needed by the theme store's runtime `<style>` elements; CSS injection can't run code but could restyle the UI. Removable by giving those elements a nonce (Tauri's style nonce) or moving tokens to `adoptedStyleSheets`.
7. **Low: Google sees what you type in the palette** (site icons come from Google's favicon service for typed hosts; search defaults to Google).
8. **Low: favicons load from the UI.** A page's favicon URL is fetched by Ezel's UI webview, so a site learns when its tab row is drawn (an IP ping). The image itself can't run code (`img-src` allows only images).
9. **Low: the session file is plain text.** `%APPDATA%\com.ezel.dev\ezel\session.json` holds every open and recently closed tab's URL and title. Other programs running as the user can read it (normal for browsers).
10. **Low: leftover data from the old identifier.** Sessions and the WebView2 profile from before the `com.ezel.dev` rename are still in `%APPDATA%\com.tauri.dev` and `%LOCALAPPDATA%\com.tauri.dev` (cookies and logins included), a folder other Tauri template apps can share.
11. **Low: SmartScreen sends addresses to Microsoft.** The price of item 3: SmartScreen checks visited sites and downloads against Microsoft's service (Edge's standard behaviour). Worth a line in the privacy notes.

Checked and fine: release builds log nothing (`tauri-plugin-log` is debug-only and no URLs are logged); the `perf` measurement hook isn't in normal builds; injected lens scripts are fixed Rust strings, top frame only, sending nothing back (they run in the tab webviews, outside the UI's CSP); the clipboard command writes only the shown tab's URL.
