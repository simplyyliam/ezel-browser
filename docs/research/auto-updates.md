# Auto-updates (v0.3.0)

Tauri v2's official updater plugin (`tauri-plugin-updater` 2.14), checked 2026-10-23.

- **Signature, not code signing.** The updater verifies each bundle with a minisign key pair (`tauri signer generate`). Free and separate from Windows Authenticode; SmartScreen still warns about the unsigned installer. Losing the private key or its password means installed copies can never update again.
- **Bundles**: `bundle.createUpdaterArtifacts: true` makes `tauri build` sign the NSIS/MSI installers (`.sig` files). It fails without `TAURI_SIGNING_PRIVATE_KEY`, so Ezel turns it on only in CI (`src-tauri/tauri.release.conf.json`, passed with `--config`).
- **Manifest**: `tauri-action` with `uploadUpdaterJson: true` uploads `latest.json` (version, notes, per-platform URL and signature; `windows-x86_64-nsis` / `-msi` keys, so an NSIS install updates with NSIS). Endpoint: `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`. GitHub's `releases/latest` skips drafts and pre-releases, so releases are no longer marked pre-release.
- **Install on Windows**: `Update::install` writes the installer to a temp folder, runs it (`installMode: passive`: a small progress window, no questions) with `/UPDATE`, and calls `std::process::exit(0)` after the `on_before_exit` hook; the NSIS installer starts the app again. Ezel saves its session first (no `RunEvent::Exit` then).
- **JS API**: the plugin registers `plugin:updater|*` commands; they're ACL-protected and Ezel never grants `updater:` permissions, so neither the UI nor a website can call them.
- **Transport**: endpoints must be `https` in release builds (the plugin refuses others unless `dangerousInsecureTransportProtocol`).

Sources: https://v2.tauri.app/plugin/updater/, https://github.com/tauri-apps/tauri-action (README, `uploadUpdaterJson`, `updaterJsonPreferNsis`), the plugin's source (`src/updater.rs`, `install_inner` on Windows).
