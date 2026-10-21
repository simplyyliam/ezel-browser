# Security review before a public release (2026-10-21)

Branch `chore/security-check`. Two things fixed (below); everything else is listed by risk and left as is.

## Fixed

### 1. Websites can't reach Tauri IPC (verified, now guarded by a test)
Tauri lets a command or event call through only when a capability matches **both** the calling webview's label and its origin (`tauri/src/ipc/authority.rs`, `resolve_access`).
- The only capability (`src-tauri/capabilities/default.json`) is scoped to `"webviews": ["ui"]`. It names no window (the window `main` also holds every tab, so a window-scoped capability would include them) and no `remote` URLs (so a page from `https://…` never matches, whatever its label).
- Tab webviews are labelled `tab-<id>` (`browser/mod.rs`), never `ui`.
- Every command is declared in the app manifest (`build.rs`), so the ACL applies to all of them; events need `core:event` permissions, which only that capability grants.
- `tests::websites_in_tabs_cannot_reach_ipc` (`src-tauri/src/lib.rs`) fails if any of this changes: a second capability file, a window or remote scope, a capability list in `tauri.conf.json`, a tab label equal to `ui`, or a command missing from the app manifest (checked: removing one from `build.rs` fails the test).

### 2. Tabs load only `http`, `https` and `about:blank`
One rule, `browser/url_policy.rs` (tested), checked everywhere an address can reach a tab:
- typed input (`navigate`, `open_tab`, the palette, the tab-name field): `file:`, `javascript:`, `data:`, `vbscript:`, `blob:` and `about:` pages other than `about:blank` are refused (`invalid_input`); the palette offers only a search for them, the name field shows "Only web addresses can be opened";
- every navigation a page starts (links, redirects, `location = …`, form posts): cancelled by `on_navigation` unless allowed;
- new windows (`target=_blank`, `window.open`, sized popups): denied unless allowed;
- restored sessions and tabs being created: a saved address that isn't allowed opens `about:blank`;
- reset to a pinned URL: skipped unless allowed.
Not covered, on purpose: `javascript:` links a page puts in its own HTML run in that page's own context when clicked (Chromium executes them without a navigation). That's the page running its own code with its own rights, not an escalation; blocking it would break sites.

## Open risks, by severity (not fixed)

1. **High: SmartScreen is off.** `BROWSER_ARGS` keeps wry's default `--disable-features=…,msSmartScreenProtection`, so WebView2's Microsoft Defender SmartScreen check (phishing and malware sites, dangerous downloads) never runs. Public users get no warning on known phishing pages or malware downloads. Fix: drop `msSmartScreenProtection` from the list (same arguments for every webview); check it doesn't bring back unwanted UI.
2. **High: no visible site identity.** Ezel has no address bar or lock icon: a tab shows the page's own title, which the page chooses. A phishing page titled "Google" looks like Google. The address is visible only by opening the palette (Ctrl+L) or the name field. Sign-in popups (sized `window.open`) open as native WebView2 windows with no Ezel UI at all.
3. **High: no Content Security Policy on Ezel's UI** (`"csp": null` in `tauri.conf.json`). The UI webview holds every command, and it renders strings websites control (titles, URLs, favicon URLs). React escapes text and nothing renders raw HTML today, but one mistake or a compromised npm dependency would give a website's string the whole IPC. A CSP is the second line of defence.
4. **Medium: permissions without a review screen.** Camera, microphone, location and clipboard requests use WebView2's default prompt, and an "Allow" is remembered in the profile with no Ezel UI to see or revoke it. (Notifications are always denied.)
5. **Medium: downloads are WebView2's defaults.** No Ezel download list (the button does nothing), so a drive-by download lands in Downloads with only WebView2's small flyout, and with SmartScreen off (1) it isn't scanned on arrival.
6. **Medium: no updates or code signing.** A security fix reaches users only when they install a new build by hand, and an unsigned installer trains them to click through Windows warnings. (The WebView2 runtime itself updates through Windows, which covers Chromium's security fixes.)
7. **Medium: DevTools in release builds.** F12 opens a page's DevTools for anyone at the keyboard, which makes "paste this into the console" scams easier. Common in browsers, but worth a setting.
8. **Low: Google sees what you type in the palette** (site icons come from Google's favicon service for typed hosts; search defaults to Google).
9. **Low: favicons load from the UI.** A page's favicon URL is fetched by Ezel's UI webview, so a site learns when its tab row is drawn (an IP ping). The image itself can't run code.
10. **Low: the session file is plain text.** `%APPDATA%\com.ezel.dev\ezel\session.json` holds every open and recently closed tab's URL and title. Other programs running as the user can read it (normal for browsers).
11. **Low: leftover data from the old identifier.** Sessions and the WebView2 profile from before the `com.ezel.dev` rename are still in `%APPDATA%\com.tauri.dev` and `%LOCALAPPDATA%\com.tauri.dev` (cookies and logins included), a folder other Tauri template apps can share.

Checked and fine: release builds log nothing (`tauri-plugin-log` is debug-only and no URLs are logged); the `perf` measurement hook isn't in normal builds; injected lens scripts are fixed Rust strings, top frame only, sending nothing back; the clipboard command writes only the shown tab's URL.
