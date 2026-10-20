# WebView2: passwords, autofill, permissions, autoplay (2026-10-20)

Used for: quiet defaults (`webview2::quiet_defaults`, `BROWSER_ARGS`). How Ezel applied each: `docs/design/decisions.md`, "Quiet defaults".

## Findings
- **Password autosave**: `ICoreWebView2Settings4.IsPasswordAutosaveEnabled` (same as `ICoreWebView2Profile6`), default **false** in WebView2 (Ezel sets it explicitly). Off = no "Save password?" prompt and nothing new saved; already saved passwords still fill.
- **General autofill** (names, addresses, phone, free text; not passwords or cards): `IsGeneralAutofillEnabled`, default **true**, **profile-wide**: every webview on the profile shares the value, so the UI and all tabs must agree. Both settings apply immediately (others wait for the next navigation).
- **Permissions**: `PermissionRequested` on each `ICoreWebView2`; set `State` to `DENY` to refuse without a prompt. `ICoreWebView2PermissionRequestedEventArgs3.SavesInProfile(false)` keeps the answer from being remembered.
- **Autoplay**: no settings API. Options: (a) the Chromium flag `--autoplay-policy=document-user-activation-required` through the environment's browser arguments (blocks sound until the user interacts, muted autoplay allowed); (b) the `AUTOPLAY` permission kind via `ICoreWebView2Profile4.SetPermissionState`, per origin, which also blocks muted autoplay. Ezel uses (a).
- **One environment**: webviews sharing a user-data folder must be created with identical browser arguments, or creation fails. wry's default arguments (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`) are dropped when you pass your own, so include them.

## Sources
- ICoreWebView2Profile6 (password autosave, general autofill): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile6
- CoreWebView2Settings (WinRT, the same settings): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2settings
- ICoreWebView2Settings4: https://opendlang.org/library/arsd.webview.ICoreWebView2Settings4.html
- tauri `WebviewBuilder::additional_browser_args` docs (same-args warning), read from the tauri 2.12.4 source.
- wry 0.57 `webview2/mod.rs` (default args, autofill and permission handling), read from source.
