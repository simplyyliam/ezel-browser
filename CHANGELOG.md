# Changelog

All notable changes to Ezel. Versions follow [Semantic Versioning](https://semver.org/); while Ezel is 0.x, a minor version brings new features and a patch version only fixes.

## [0.3.0] - 2026-10-23

Everyday and safe: folders, full right-click menus, find, downloads and error pages, and you can always see which site you're on.

### Added
- **See which site you're on.** Move the pointer to the top edge: the titlebar shows the site's domain with a lock (an open lock for sites without HTTPS, a warning for certificate problems), with only the part that matters in bold. Click it for the connection, the site's permissions and "Clear This Site's Data…".
- **Folders.** Make one from a tab's right-click menu ("New Folder with Tab"), the sidebar's empty space or the + button; drag tabs into a folder (drop on the middle of its row) and out again. Rename, collapse, unpack or delete it from its own menu.
- **Ezel's own right-click menu on web pages**: open a link in a new tab, copy links and images, save images, copy and paste, search for the selected text, and Inspect.
- **Find in page** with Ctrl+F: a small bar in the page's corner with the number of matches; Enter and Shift+Enter move between them, Esc closes it.
- **Downloads**: the download button now opens a list with progress, and lets you open a file, show it in its folder, or cancel. It replaces the small Edge-style pop-up.
- **Permission prompts from Ezel.** When a site wants your camera, microphone, location or clipboard, the titlebar asks you, naming the site. Your answer is remembered per site; review or forget them in the site's panel or in "Site Permissions" (command palette).
- **Calm error pages** for being offline, an address that can't be found, a site that isn't answering, a certificate problem (with no way past it) and a page that crashed, each with one clear next step.
- **Video fullscreen fills the whole window**; Esc or the video's own button brings Ezel back.
- **Recently closed tabs** show as small chips at the bottom of the command palette (Ctrl+T); click one to bring it back where it was.
- **Hover a link to see where it goes**, in a small pill at the page's bottom-left.
- **Import from Zen** (command palette): choose which Zen spaces to bring over; Essentials become Swatches, and pinned tabs, folders and open tabs keep their order. Zen itself is never changed, and logins and cookies stay in Zen.
- **Quick tabs in the titlebar**: the other tabs of the folder you're in (or your Swatches) as small icons, one click away.
- **Ctrl+D pins the current tab**, Ezel's way of bookmarking.
- **Automatic updates.** Ezel checks for a new version when it starts and once a day, downloads it quietly and shows "Update ready" at the bottom of the sidebar. Nothing restarts until you click it.

### Changed
- **Big sessions stay fast**: with 130 tabs (say, from a Zen import) switching tabs and spaces is instant again. Very large site icons (over 64 KB) are dropped and come back when the tab is next opened.
- **Swatches hold up to 12 sites** (was 8), like Zen's Essentials: three rows of four. Ctrl+1–8 still reach the first eight.
- **Every sidebar right-click menu is complete**, and menus always stay inside the sidebar. Reload works on any loaded tab, not just the one on screen.
- **Deleting a space asks what to do with its tabs**: move them to another space, or close them (closed tabs can still be reopened with Ctrl+Shift+T). Empty spaces and folders go without a question.
- **Sign-in pop-ups** ("Sign in with Google") open in a small Ezel window whose title starts with the site's domain, so you can see who's asking.
- Buttons and rows give a little when you press them. With reduced motion turned on in Windows, menus and dialogs simply fade instead of sliding or zooming.

### Known issues
- **The installer isn't code-signed**, so Windows SmartScreen shows a warning when you run it: choose "More info", then "Run anyway".
- **Tabs and sign-ins from 0.1.0 don't carry over**, because Ezel's data moved to its own folder. The old data stays in `%APPDATA%\com.tauri.dev` and `%LOCALAPPDATA%\com.tauri.dev`, and you can delete it.
- **Windows only for now.** On macOS and Linux, most of what's new (menus, find, downloads, permissions, error pages, updates) doesn't work yet.
- **Still to come**: zoom, history, print, a private window, importing from Arc, Chrome or Edge, and a settings page.
- **Background tabs pause after 30 seconds**, so a chat or timer in a tab you're not looking at won't update until you open it. A site can only ask for a permission while its tab is on screen.
- **Passwords and autofill are off on purpose** until Ezel has its own passwords screen (passwords saved earlier still fill in), and websites' notification requests are always declined.
- **Rough edges**: find in page needs a recent WebView2 (Windows keeps it up to date); the downloads list is cleared when Ezel closes; on keyboards with AltGr (for example Polish or German), the lens shortcuts Ctrl+Alt+S and Ctrl+Alt+G can stop you typing the character on those keys.

### Privacy
- Ezel now checks GitHub for updates when it starts and once a day, and downloads new versions from there. Nothing else about you is sent.
- Site permissions you choose are kept on your computer, in Ezel's own folder.
- SmartScreen checks the sites you visit and the files you download with Microsoft, as in Edge.
- The command palette's suggestions and site icons come from Google: searches go to Google, and Google's icon service sees the sites you type.

## [0.2.1] - 2026-10-22

Smoother overlays and a cleaner start: no more dark flashes over the page, and a sidebar that stays when you reach for it.

### Changed
- Ezel has a new app icon in the taskbar and Start menu (a placeholder until the final one).

### Fixed
- **No more dark boxes over the page.** Opening or closing the command palette, a menu or the peeking sidebar could flash a dark rectangle over the website. Menus and the command palette that open over the page now appear and disappear in one piece, without a delay.
- **The peeking sidebar slides cleanly.** It no longer leaves a dark trail behind it or runs ahead of itself as it slides in and out, most noticeable right after starting Ezel or bringing it back from the taskbar.
- **The sidebar stays when you reach for it.** Moving onto the card while it was still sliding out, or after minimizing and restoring the window, could make it slide away under your pointer. After a restore it could also peek out behind the page instead of over it.
- **A menu opened near the sidebar's edge shows all at once**, instead of its outer half appearing a moment after the rest.
- **No white flash at launch.** Ezel opens in your theme's colour, and your tab appears once its page is ready, instead of flashing white (or half white, half black) first. The page fills the window to the bottom.

### Known issues
- **There's no address bar or lock icon yet**, so check which site you're on before signing in anywhere (Ctrl+L shows the address).
- **The installer isn't code-signed**, so Windows SmartScreen shows a warning when you run it: choose "More info", then "Run anyway".
- **Tabs and sign-ins from 0.1.0 don't carry over**, because Ezel's data moved to its own folder. The old data stays in `%APPDATA%\com.tauri.dev` and `%LOCALAPPDATA%\com.tauri.dev`, and you can delete it.
- **Windows only for now.** On macOS and Linux, mute, developer tools, copying the page link, the memory readout and rounded page corners don't work yet.
- **Everyday basics still to come**: the downloads button doesn't open a list yet, and there's no find in page, zoom, history, print, private window, bookmark import, website right-click menu, creating new folders, or a screen to review the camera, microphone and location permissions you've allowed.
- **Background tabs pause after 30 seconds**, so a chat or timer in a tab you're not looking at won't update until you open it.
- **Passwords and autofill are off on purpose** until Ezel has its own passwords screen (passwords saved earlier still fill in), and websites' notification requests are always declined.
- **Rough edges**: sign-in popups (such as "Sign in with Google") open in a plain separate window without Ezel's shortcuts; video fullscreen may not fill the window and failed pages show the plain default error screen; on keyboards with AltGr (for example Polish or German), the lens shortcuts Ctrl+Alt+S and Ctrl+Alt+G can stop you typing the character on those keys.

### Privacy
- SmartScreen checks the sites you visit and the files you download with Microsoft, as in Edge.
- The command palette's suggestions and site icons come from Google: searches go to Google, and Google's icon service sees the sites you type.

## [0.2.0] - 2026-10-21

Lighter with many tabs, and safer to use on the open web.

### Added
- When you type an address Ezel can't open (such as a local file), the tab tells you "Only web addresses can be opened" instead of doing nothing, and the command palette offers to search for it.

### Changed
- **Lighter on memory.** At most 5 tabs stay loaded (was 8). A background tab you haven't looked at for 5 minutes rests (was 30 minutes) and reloads when you open it. Background tabs pause after 30 seconds and pick up again when you open them. Tabs playing sound and local development tabs are never paused or put to rest. With 10 tabs open Ezel uses about 9% less memory, and after 5 idle minutes about 20% less (a third less committed memory).
- **SmartScreen is on.** Microsoft Defender SmartScreen now warns you about sites reported for phishing or malware and checks your downloads, as in Edge.
- **Ezel keeps its data in its own folder** (`com.ezel.dev`) instead of a generic one shared with other apps built from the same template.
- Pages can still open files they generate themselves, such as a PDF or image preview in a new tab.

### Fixed
- Local files (`file:`), scripts (`javascript:`) and raw data (`data:`) can no longer be opened in a tab, whether you type them or a page tries to open them.
- Websites open in your tabs can't reach Ezel's own controls. This was already the case, and now an automatic test keeps it that way.
- Ezel's own interface now has a strict content security policy, so a string from a website can't run as code inside Ezel.

### Known issues
- **There's no address bar or lock icon yet**, so check which site you're on before signing in anywhere (Ctrl+L shows the address).
- **The installer isn't code-signed**, so Windows SmartScreen shows a warning when you run it: choose "More info", then "Run anyway".
- **Tabs and sign-ins from 0.1.0 don't carry over**, because Ezel's data moved to its own folder. The old data stays in `%APPDATA%\com.tauri.dev` and `%LOCALAPPDATA%\com.tauri.dev`, and you can delete it.
- **Windows only for now.** On macOS and Linux, mute, developer tools, copying the page link, the memory readout and rounded page corners don't work yet.
- **Everyday basics still to come**: the downloads button doesn't open a list yet, and there's no find in page, zoom, history, print, private window, bookmark import, website right-click menu, creating new folders, or a screen to review the camera, microphone and location permissions you've allowed.
- **Background tabs pause after 30 seconds**, so a chat or timer in a tab you're not looking at won't update until you open it.
- **Passwords and autofill are off on purpose** until Ezel has its own passwords screen (passwords saved earlier still fill in), and websites' notification requests are always declined.
- **Rough edges**: sign-in popups (such as "Sign in with Google") open in a plain separate window without Ezel's shortcuts; video fullscreen may not fill the window and failed pages show the plain default error screen; on keyboards with AltGr (for example Polish or German), the lens shortcuts Ctrl+Alt+S and Ctrl+Alt+G can stop you typing the character on those keys.

### Privacy
- SmartScreen checks the sites you visit and the files you download with Microsoft, as in Edge.
- The command palette's suggestions and site icons come from Google: searches go to Google, and Google's icon service sees the sites you type.

## [0.1.0] - 2026-10-20

The first release: a calm, lightweight browser for designers, on Windows.

### Added
- **The window**: one frameless window with its own titlebar that slides down when you move the pointer to the top edge, and rounded page corners that follow Windows 11.
- **Sidebar**: tabs live in a sidebar that peeks out when you hover the window's left edge, or stays docked next to the page (Ctrl+B).
- **Spaces**: separate groups of tabs, each with a name and an icon; switch, rename, reorder and delete them.
- **Swatches**: up to 8 favourite sites in a grid at the top of the sidebar, shared by every space.
- **Pinned and temporary tabs, and folders**: pin the tabs you keep, let the rest pile up as temporary tabs, and clear those in one go. Folders can be opened, closed and unpacked.
- **Drag and drop** tabs between Swatches, pinned and temporary tabs, and other spaces.
- **Command palette** (Ctrl+T, Ctrl+L or Ctrl+K): type an address or a search, jump to any open tab, or run an action by name.
- **Session restore**: your spaces and tabs come back after a restart; tabs load only when you open them.
- **Light on memory**: at most 8 tabs stay loaded, and tabs you haven't used for 30 minutes rest until you come back.
- **Familiar shortcuts**: Ctrl+W close tab, Ctrl+Tab and Ctrl+Shift+Tab for recent tabs, Ctrl+1–8 for Swatches, Ctrl+9 for the last tab, Ctrl+R or F5 to reload, Ctrl+Shift+R to reload without the cache, Alt+← and Alt+→ for back and forward, Esc to stop loading, F12 or Ctrl+Shift+I for developer tools, and Ctrl+Shift+C to copy the page link (a small note confirms it).
- **Reopen closed tabs** with Ctrl+Shift+T, or from the sidebar's right-click menu: tabs come back where they were, up to 25 deep, even after a restart.
- **Mute a tab**: a speaker appears on tabs that play sound; click it, or use the tab's menu, to mute. A muted tab stays muted.
- **Local development tabs**: pages on localhost get a small "dev" label and are never put to rest, so the build you're reviewing keeps its state.
- **Memory readout**: "Ezel is carrying ~N MB" at the bottom of the sidebar, with the heaviest tabs listed when you hover it.
- **Squint and Greyscale lenses** (Ctrl+Alt+S and Ctrl+Alt+G, or from the command palette): blur the page to check its hierarchy, or remove colour to check it still works. Lenses stay on while you browse in that tab.

### Changed
- **Quiet by default**: Ezel doesn't offer to save passwords or autofill forms, turns down websites' requests to send notifications without asking you, and doesn't let videos play sound until you've clicked the page.
- Google is the default search engine and home page.

### Fixed
- The memory readout could crash Ezel when the sidebar appeared. It no longer can, and if a reading fails it keeps showing the last one (it hides after 15 seconds without a new one).

### Known issues
- **Windows only for now.** On macOS and Linux, mute, developer tools, copying the page link, the memory readout and rounded page corners don't work yet.
- **Everyday basics still to come**: the downloads button doesn't open anything yet, and there's no find in page, zoom, history, print, private window, bookmark import, website right-click menu, or creating new folders.
- **Fullscreen video and error pages** may not look right: video fullscreen may not fill the window, and failed pages show the plain default error screen.
- **Passwords and autofill are off on purpose** until Ezel has its own passwords screen (passwords saved earlier still fill in). Notifications are always declined, and other permission requests (camera, location) use a basic prompt.
- **Lens shortcuts on some keyboards**: on layouts that use AltGr (for example Polish or German), Ctrl+Alt+S and Ctrl+Alt+G can stop you typing the character on those keys.
- **Sign-in popups** (such as "Sign in with Google") open in a plain separate window without Ezel's shortcuts or quiet defaults.
- **Privacy**: the command palette fetches site icons from Google as you type an address, so Google sees the sites you type.
- **Safety hardening still to do**: Ezel's cookies and logins are stored under a generic folder name other test apps can share, Ezel's own interface has no content security policy yet, and local file addresses (file://) can be opened from the address field.
