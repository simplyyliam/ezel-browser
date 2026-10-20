# Browser shortcuts (2026-10-20)

Used for: the hotkeys pack and reopen closed tab (`shared/hotkeys.ts`, `cycle_tab`, `reopen_closed_tab`).

## Findings
- **Ctrl+Tab order.** Chrome cycles in strip order. Firefox (and so Zen) has a setting, "Ctrl+Tab cycles through tabs in recently used order"; Zen exposes it, and Zen users report it fighting with Zen's own Ctrl+Shift+Tab binding. Arc and Dia use recently-used order. Ezel: recently used, within the active space (browser-basics.md #25 asked to decide; MRU fits a vertical, per-space sidebar).
- **Holding Ctrl.** Firefox walks deeper while Ctrl is held and commits on release. Ezel can't see key-ups from the website's webview, so quick presses (within 1.2s) continue one walk instead.
- **Ctrl+Shift+C** copies the current URL in Arc and Zen without moving focus off the page; Arc confirms with a small toast. Brave has the shortcut but no toast, and users ask for one. Ezel: same keys and behaviour, its own toast wording and look ("Link copied · host").
- **Ctrl+Shift+T** reopens the last closed tab in every major browser, Arc included; repeated presses go further back.
- **Ctrl+1…8 / Ctrl+9**: Chrome-standard (n-th tab / last tab). Ezel maps 1–8 to Swatches (its pinned grid, like Arc's favourites) and 9 to the space's last row.

## Not copied
Arc's toast design and its share button; Zen's tab-switcher popup.

## Sources
- Zen Ctrl+Tab MRU setting and Ctrl+Shift+Tab conflict: https://github.com/zen-browser/desktop/issues/5552
- Firefox "recently used order" discussion: https://connect.mozilla.org/t5/ideas/tab-preview-when-using-ctrl-tab/idi-p/94146
- Arc's copy-URL toast (user report): https://orionfeedback.org/d/9718
- Brave request citing Arc's toast: https://community.brave.app/t/fr-copy-url-as-markdown-and-toast-notifications/657667
- Copy current tab URL shortcut requests (Firefox): https://connect.mozilla.org/t5/ideas/copy-current-tab-url/idc-p/97390
- Reopen closed tab across browsers: https://www.tomsguide.com/how-to/how-to-reopen-closed-tabs-on-any-computer-browser
- Arc shortcut list: https://hongkiat.com/blog/arc-browser-keyboard-shortcuts
