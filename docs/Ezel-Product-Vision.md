# Ezel — Product Vision

Ezel should be the browser that replaces a designer's pile of 10–15 extensions with a small set of built-in, safe, beautiful tools. It should do that while staying light enough that you never think about RAM.

## TL;DR

- **What Ezel is:** a calm, lightweight Windows browser where inspecting, collecting and reviewing the web are built-in, toggleable tools instead of third-party extensions. Pinterest, DevTools and a moodboard, inside a browser that doesn't eat your RAM.
- **Why now:** designers stitch together ColorZilla, WhatFont, CSS Peeper, VisBug, GoFullPage, Responsive Viewer and clippers. In 2024–2025 that stack proved slow (the effect is additive, per DebugBear)\[1\] and unsafe. "Color Picker, Eyedropper — Geco colorpick", a "featured" extension with 100,000+ installs, was the first of 18 extensions in Koi Security's "RedDirection" campaign. Koi says those extensions "auto-installed silently for over 2.3 million users" (disclosed July 8, 2025). Meanwhile Arc, the designers' favourite, stopped developing in May 2025.\[2\]
- **What to build first:** the basics, then four signature tools: **Loupe** (hover inspector), **Palette Pull** (extract and export colours), **Shelf** (clips that remember their source) and **Tracing Paper** (overlay a Figma export on localhost). Each one is a 30-second demo clip for building in public.

---

## 1. What Ezel is

**Ezel** (Dutch: *easel*, and also *donkey*) is a free, Windows-first browser for designers that still works as a great everyday browser. It carries your work: the sites you study, the colours you steal, the builds you review.

**Who it's for:** UI/UX and product designers, design engineers, web and visual designers. Also anyone who wants a calm, pretty, light browser.

**The promise: four principles**

| Principle | What it means in practice |
|---|---|
| **Light** | Max 8 loaded tabs, idle unload, an honest per-tab memory meter. No bundled Chromium. |
| **Made for designers** | Inspect, extract, collect and review are native tools. You install nothing. |
| **Calm** | No feeds, no AI sidebar, no badges begging for attention. Tools appear when called, then leave. |
| **Crafted** | Soft minimal UI, small alive details, a few tasteful "ceremonies". Restraint over features. |

**One-liners to use in posts**

- "Ezel. Carries your work."
- "Pinterest, DevTools and a moodboard, inside a browser that doesn't eat your RAM."
- "Fifteen extensions → one browser."

---

## 2. Key findings: what designers do in a browser today

### 2.1 The daily loop

| Job | Typical tools today | Pain |
|---|---|---|
| **Find inspiration** | Pinterest, Dribbble, Behance, Mobbin, Savee, Cosmos, Are.na, Muzli | Lives in many tabs and accounts. Saves lose context (where, when, why). |
| **Study a live site** | WhatFont, Fonts Ninja, CSS Peeper, ColorZilla, VisBug, Wappalyzer | Separate tool per question. Each with its own UI and popup. |
| **Grab assets** | SVG export extensions, GoFullPage, screenshot tools | Clunky exports. Paid tiers. |
| **Check responsive** | Responsive Viewer, Window Resizer, Polypane, Sizzy, Responsively | Resizing manually or paying for a separate dev browser. |
| **Check accessibility** | Lighthouse, axe, Silktide, contrast checkers | Dev-oriented, wordy reports. |
| **Pixel QA vs design** | PerfectPixel, Pixelay, Page Ruler, Dimensions | Overlays are fiddly. Measurement tools feel dated. |
| **Hand off and feedback** | Loom, Figma's extension, html.to.design, Builder.io, Usersnap | Context switching between browser, Figma and chat. |

**What this means:** the list of "best extensions for designers" is remarkably stable across 2025–2026 roundups. ColorZilla, WhatFont, CSS Peeper, VisBug, Responsive Viewer and Muzli keep showing up (Attention Insight, InspoAI, GeeksforGeeks, uinkits).\[3\]\[4\]\[5\]\[6\]\[7\] The jobs are known and stable. That makes them perfect to build in natively.

### 2.2 What's wrong with the extension stack

| Pain | Evidence |
|---|---|
| **Slowness adds up** | DebugBear tested 5,000 popular Chrome extensions in 2024. Only 1.7% cost over 500 ms of CPU each, but "this effect is additive between extensions, so installing 10 moderately fast Chrome extensions can still lead to a noticeable slowdown."\[1\] AI extensions were among the worst. DebugBear's Matt Zeunert found that "the MaxAI chrome extension with 800,000 users adds 2.3 seconds of processing time to every page visit," and Monica (2M users) "adds 1.3 seconds… even on a simple test website" (May 16, 2024). |
| **Security risk** | In July 2025 Koi Security traced 18 extensions (11 Chrome, 7 Edge) that went malicious via silent updates. They had about 1.7M Chrome installs plus 600,000 Edge installs (Infosecurity Magazine). The investigation started with a *colour picker*, "Color Picker, Eyedropper — Geco colorpick" (gHacks). Koi also tied the "ShadyPanda" threat actor, active since 2018, to five extensions that turned malicious in mid-2024 (Malwarebytes, Dec 2, 2025). WeTab New Tab Page alone had about 3M installs (BleepingComputer). A GitLab Threat Intelligence Tech Note (13 Feb 2025) found "at least 16 malicious Chrome extensions… spanning screen capture, ad blocking and emoji keyboards" that "impact at least 3.2 million users." |
| **Updates aren't reviewed like launches** | Malwarebytes: "Google vets new extensions carefully, but updates don't get the same attention."\[8\] |
| **Paid upsells** | Hoverify charges $30/year or $89 lifetime. Wappalyzer Pro is $99/month.\[9\] Many "free" tools gate exports. |
| **Inconsistent, breaking UI** | Every extension has its own popup style. Attention Insight notes ColorZilla reviews mention "a UI regression after the latest redesign."\[4\] |
| **Clutter** | One Polypane reviewer said switching let them "remove about a dozen SEO and accessibility-checking plugins," "speeding up my computer and removing clutter."\[10\] |

**What this means for Ezel:** "no extension store" is a *selling point*, not a gap. The pitch is: *every tool you used to install is already here, made by one person who cares, and nothing updates itself behind your back.*

### 2.3 What we learned from other design-minded browsers

| Product | What designers loved | What went wrong / limits | Lesson for Ezel |
|---|---|---|---|
| **Arc** | Sidebar, Spaces, Peek, Little Arc, Boosts + Zap, Easels, split view | CEO Josh Miller (May 2025): Arc was "too different, with too many new things to learn, for too little reward" and "lacked cohesion." Development stopped. Atlassian bought The Browser Company for $610M (closed Oct 21, 2025).\[2\]\[11\] | Keep the number of *new concepts* small. Make each one obviously useful on day one. |
| **Dia** | Simpler, faster | AI-first. Dia Pro costs $20/month. Now aimed at enterprise "knowledge workers."\[2\]\[12\] | The space for a calm, non-AI, designer browser is open. |
| **Zen** | Arc-like UX, free, Mods | Firefox-based. GitHub issues report heavy RAM use: ~3 GB on an 8 GB laptop (#504) and ~730 MB with one empty tab on Windows 11 (#11216). One reply notes Zen only unloads idle tabs when system RAM runs low (#14569).\[13\]\[14\]\[15\] | Ezel's honest memory story is a real differentiator. Prove it with screenshots. |
| **Polypane** | Synced multi-viewports, 80+ accessibility tests, 19 simulators | Paid (14-day trial). Built for building, not browsing.\[16\]\[17\] | Borrow the *ideas* (synced viewports, simulators) as lighter, designer-flavoured toggles. |
| **Sizzy / Blisk / Responsively** | Many devices side by side | Paid (Sizzy) or dev-only. Multi-viewport is resource-heavy.\[18\]\[19\] | One "Devices" view is enough. Don't build a testing lab. |
| **Kosmik** | Canvas + built-in browser + auto-tagging of colours/objects | After the trial you can't edit, import or use AI.\[20\] It's a canvas app with a browser bolted on. | Flip it: a *browser* with a moodboard built in. |
| **Opera GX** | Mods, sounds, themes | Gamer aesthetic. | Only borrow concepts that are mainstream elsewhere (themes, per-site styles). |

---

## 3. Feature map

**Legend:** Priority = **Now** (Phase 1–2) · **Next** (Phase 3) · **Later** (Phase 4+) · **Maybe** (only if it earns its place). Effort = **S** (days) · **M** (1–2 weeks) · **L** (3+ weeks), for a solo junior dev.

### 3.1 Everyday browsing (selective)

Already built: Spaces, Swatches, pinned tabs and folders, temp tabs, drag and drop, tab unloading, session restore, Ctrl+K palette, peek titlebar. The **browser basics checklist** covers the rest (downloads, find, zoom, history, private window, print, PiP, DevTools and more). This list is only the *extra* everyday features worth having.

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Peek titlebar quick-icons** | The titlebar shows icons of other tabs in the current folder. | Jump between Figma, localhost and docs without the sidebar. | Now | S |
| **Glance** | Open a link in a floating preview card. Close it or keep it. | Check references without polluting tabs (Arc's Peek was widely loved).\[21\] | Now | M |
| **Split view (2-up)** | Two tabs side by side. | Figma next to localhost, inspo next to your work. | Next | M |
| **Recently closed tray** | Ctrl+K shows the last 10 closed tabs as thumbnails. | "Where did that site go?" | Now | S |
| **Built-in content blocking** | Simple ad/tracker blocking via a filter list. | Inspo sites are ad-heavy. On two news articles, DebugBear's 2024 tests found uBlock Origin cut CPU time from 57 seconds to just under 4 seconds and page weight from 41 MB to under 3 MB. | Next | M |
| **Reader view** | Clean article mode. | Case studies and design articles. | Maybe | M |
| **Little Ezel** | Links from other apps open in a small floating window. | Slack/Figma links don't wreck your Space. | Later | M |

**Deliberately skipped:** 4-way split, tab stacking, built-in VPN, sidebar messengers, workspaces sync (for now).

### 3.2 Inspect & extract

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Loupe (hover inspector)** ⭐ | Hold a key, hover anything: font, size, weight, colour, spacing, radius. | Replaces WhatFont + CSS Peeper + Dimensions. No DevTools needed. | Now | M |
| **Pick Color / eyedropper** | Full-screen eyedropper with a zoom loupe. Copies HEX/RGB/OKLCH. | Replaces ColorZilla, the most-listed designer extension. | Now | S |
| **Palette Pull** ⭐ | Pull a page's palette, grouped and de-duplicated. Export as CSS vars, Tailwind, JSON or .ase. | Turn any site into a starting palette in one click. | Now | M |
| **Type Report** | Lists every font family, size and weight on the page as a clean type scale. | Study a site's type system in seconds. | Now | M |
| **Asset Grab** | Gallery of all images and SVGs. Download or copy as SVG. | Replaces SVG-export extensions. | Next | M |
| **Capture** | Visible area, full page, or a single element (component snapshot). | Replaces GoFullPage. Feeds Shelf. | Now | M |
| **Ruler & spacing overlay** | Drag to measure. Hover to see gaps between elements. | Pixel QA without Page Ruler. | Next | M |
| **Grid overlay** | Shows a configurable column grid / baseline over any page. | Check layout rhythm. | Next | S |
| **Contrast check** | Pick two colours (or hover text). Shows WCAG AA/AAA pass/fail. | Accessibility without a report. | Now | S |
| **Stack sniff** | Shows "Built with Next.js, Tailwind, Framer…" | Wappalyzer, minus the $99/month Pro tier.\[9\] | Maybe | M |

### 3.3 Collect & organise (inspiration)

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Shelf (moodboard sidebar)** ⭐ | Drag any image, capture or colour onto a shelf in the sidebar. | Pinterest/Cosmos-style saving without leaving the page.\[22\]\[23\] | Next | L |
| **Clips that remember** ⭐ | Each clip stores URL, date, page title, palette and fonts automatically. | "Where did I find this?" is answered forever. | Next | M |
| **Search by colour** | Find clips by dominant colour ("show me the blue ones"). | Visual memory beats folder names. | Next | M |
| **Auto-tags (local)** | Tags from the page: site, colours, fonts, type of capture. No AI needed. | Organised without effort. | Next | S |
| **Spaces become boards** | Every Space gets its own Shelf. A Space = a project. | Tabs and inspo for a project live together. | Next | S |
| **Revisit snapshots** | Saves a frozen copy (MHTML) of a page you clipped. | Sites redesign. Your reference shouldn't vanish. | Later | M |
| **Rediscover** | New tab shows one random old clip, softly. | Joy plus resurfacing forgotten inspo. | Next | S |
| **Board export** | Export a board as a PNG grid, PDF or folder (with a sources.txt). | Share with clients or drop into Figma. | Later | M |
| **Inspo feed mode** | A curated feed of saved sources (Savee, Cosmos…) in one view. | — | Maybe | L |

> Note: "Inspo feed mode" conflicts with *Calm* (no feeds). Keep it **Maybe**, and only as *your own* saved sources, never an algorithmic feed.

### 3.4 Build & review (localhost, responsive, overlays, a11y)

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Localhost-aware tabs** | Detects `localhost:*`, shows a "dev" badge, auto-reloads on save, never unloads. | Review builds without losing state to tab sleeping. | Now | S |
| **Tracing Paper (onion skin)** ⭐ | Drop a Figma PNG export onto the page at 50% opacity. Nudge with arrow keys. Toggle difference mode. | PerfectPixel, built in.\[24\] The best "design vs build" demo. | Next | M |
| **Devices view** | 3 synced viewports (phone, tablet, desktop) with synced scroll. | Responsive checks without paying for a separate dev browser. | Next | L |
| **Quick viewport presets** | Ctrl+K → "375" resizes the page to 375 px. | Fast single-size check. | Now | S |
| **Dark/light forcing** | Flip `prefers-color-scheme` per tab. | Check both themes instantly. | Next | S |
| **Reduced motion toggle** | Emulate `prefers-reduced-motion`. | Accessibility review of animations. | Next | S |
| **Throttle** | "Slow 3G" toggle. | See loading states and skeletons. | Later | S |
| **Visual diff** | Compare today's localhost to yesterday's capture. Highlights changes. | Catch accidental regressions. | Later | L |

### 3.5 See differently (lenses)

All lenses live in one **Lens menu**: one key, then a number. They are cheap to build (mostly CSS filters or Chromium emulation) and very demo-friendly.

| Lens | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Squint** ⭐ | Blurs the page. | The classic hierarchy test, now one keypress. | Now | S |
| **Greyscale** | Removes colour. | Does it work without colour? | Now | S |
| **Colour-blindness sim** | Protanopia, deuteranopia, tritanopia, achromatopsia. | Inclusive colour choices. | Next | S |
| **Wireframe view** | Outlines boxes, hides images, greys text. | See the structure under the polish. | Next | M |
| **Font swap** | Try any Google Font on the live site. | "What if this was in Inter?" | Later | M |
| **Palette swap** | Remap the site's colours to your palette. | Pitch a rebrand on the real site. | Later | L |
| **Live palette strip** | A thin strip at the bottom showing the current page's colours. | Ambient colour awareness while browsing. | Maybe | S |

### 3.6 Share & hand-off

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Copy as…** | Copy a colour/type token as CSS, Tailwind, JSON or Figma-friendly text. | Hand-off in the format devs use. | Now | S |
| **Annotate capture** | Draw arrows, boxes and numbered notes on a screenshot. | Quick client and dev feedback. | Next | M |
| **Spec card** | One image showing an element plus its font, colours and spacing. | Paste into Slack or Linear. | Later | M |
| **Copy to Figma** | Paste a captured element as editable layers. | html.to.design-style. Hard to do well. | Maybe | L |

### 3.7 Make it yours (themes, per-site styles, tools)

See **Section 4** for the full approach.

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Paints (themes)** | Ezel UI colour themes and per-Space tints. | Designers want their tools pretty. | Next | S |
| **Glaze (per-site style)** | Change colours and fonts, and hide elements ("zap"), on any site. Saved per site. | Arc Boosts, the most-copied Arc idea.\[25\] | Later | M |
| **Glaze CSS** | Advanced: write your own CSS for a site. | Userstyles for power users. | Later | S |
| **Toolbox** | Turn built-in tools on/off and pick their shortcuts. Unused tools cost nothing. | Your browser, your toolset. | Next | S |
| **Share a Glaze/Paint** | Export/import as a small `.ezel` JSON file. CSS only. | Community sharing on Threads/Reddit. | Later | S |

### 3.8 Calm & performance

| Feature | What it does | Why designers care | Priority | Effort |
|---|---|---|---|---|
| **Load meter** ⭐ | Honest per-tab and total memory, shown as "how much Ezel is carrying." | Builds trust. Zen-refugees will screenshot it. | Now | M |
| **Studio vs Browse mode** | Studio shows design tools. Browse hides them all. | One browser for work and life. | Next | S |
| **Smart sleep** | Inactive tabs set to low memory, then suspended, then unloaded. | Light without losing your place. | Now | M |
| **Quiet by default** | No notification prompts unless you allow the site. No autoplay with sound. | Calm. | Now | S |
| **Focus Space** | A Space that hides everything but the current tab. | Deep-work sessions. | Maybe | S |

### 3.9 Delight (tiny, tasteful)

| Detail | What it does | Priority | Effort |
|---|---|---|---|
| **Easel unfold** | First launch: a short easel-unfolding animation, then your first Space. | Next | S |
| **Pin-to-shelf** | A clip "pins" onto the Shelf with a tiny bounce and a soft tick. | Next | S |
| **Paint drops** | Palette Pull drops swatches in one by one (50 ms stagger). | Now | S |
| **Sleepy tabs** | Unloaded tabs dim slightly with a soft breathing dot. | Now | S |
| **Donkey moments** | A rare, hidden donkey: e.g. the Load meter at 0 says "Ezel is resting." | Later | S |
| **Sounds (off by default)** | Optional soft clicks for capture and clip. | Maybe | S |

---

## 4. Mods without extensions

### 4.1 What mainstream software does

| Product | Customisation model | Safety approach | Takeaway |
|---|---|---|---|
| **Arc Boosts** | Per-site colours, fonts, Zap, optional CSS/JS | "Boosts containing custom code cannot be shared" (JS boosts not shareable "for security reasons"). Designer Nate Parrott wanted to make it "10 times easier" to build an extension.\[26\]\[27\] | Per-site styling is beloved. Sharing only CSS is the safe line. |
| **Figma plugins** | JS plugins | Logic runs in a QuickJS VM compiled to WebAssembly. UI runs in an iframe. Network domains are declared in a manifest. Figma: "We do not rely on human reviews… We instead use a sandbox."\[28\]\[29\]\[30\] | Sandbox + declared permissions is the gold standard. |
| **Raycast extensions** | React/TS extensions in a store | Every extension is open source and reviewed, *including updates*. They run in a separate process with "a defined set of APIs."\[31\]\[32\] | Reviewing updates fixes Chrome's biggest hole. |
| **Obsidian plugins** | JS plugins | Obsidian "cannot reliably restrict plugins". Plugins "can access files", "connect to internet", "install additional programs". Restricted mode is on by default and plugins don't auto-update. Abused in 2026 to deliver a RAT (Elastic Security Labs).\[33\]\[34\]\[35\] | Unsandboxed code is the cautionary tale. |
| **Zen Mods / Sine** | CSS mods (curated) + community JS manager | Official mods are curated. Sine needs "Enable installing JS from unofficial sources" for JS.\[36\]\[37\] | Curated CSS is fine. JS is where risk enters. |
| **Vivaldi** | Custom UI CSS folder (experimental) | "Code shared on the forum has not been reviewed by the Vivaldi Team."\[38\] | Power users love it, but it's hidden for a reason. |
| **VS Code themes** | JSON colour themes | Themes are data, not code. | Themes as pure data are safe and popular. |

### 4.2 Ezel's approach: "Tools, Paints and Glazes"

**Rule of thumb:** *Ezel runs data from users. Ezel runs code only from Ezel.*

| Layer | What it is | Format | Can share? | Risk |
|---|---|---|---|---|
| **Tools** | Built-in features (Loupe, Palette Pull, Lenses…), toggled in the Toolbox | Ships with Ezel | n/a | Lowest: reviewed by you, updated with the app |
| **Paints** | Ezel UI themes | JSON tokens (colours, radius, blur) | Yes | None: pure data |
| **Glazes** | Per-site style: colour/font swaps, zaps, optional CSS | JSON + CSS | Yes (CSS only) | Low: CSS can't steal data… mostly (see below) |
| **Scripts** | User JS per site | — | — | **Not supported** in v1 |

**Security guardrails for Glazes**

- CSS only. No JavaScript, ever, in shared files (Arc's rule).\[25\]
- Block `@import` and remote `url()` in shared Glazes. CSS can make network requests, so only allow `data:` URLs and local fonts.
- Show a preview before applying an imported Glaze, plus "Applies to: dribbble.com".
- One-click "Disable all Glazes" (safe mode) in Ctrl+K.
- Never apply Glazes to browser pages (settings, error pages, `ezel://`).

**About WebView2 extensions:** WebView2 *can* load unpacked extensions. But Microsoft's docs say extensions with UI "will have missing UI entry points due to the lack of browser UI elements to host these entry points."\[39\]\[40\] Treat this as a **hidden power-user flag at most** (e.g. a password manager's autofill). Never as a store.

**Later, maybe: Ezel Tools SDK.** If you ever open up tools, copy Figma and Raycast: a sandboxed runtime, a declared permissions manifest, open-source and reviewed updates. That's a v3 conversation, not a v1 one.

---

## 5. What Ezel deliberately won't do

| Won't | Why |
|---|---|
| **Chrome Web Store / extension store** | It's the slow, risky, inconsistent part of today's stack. Also, WebView2 can't show extension popups.\[40\] |
| **AI sidebar (at first)** | Dia, Edge and Chrome are all racing there. Calm is Ezel's lane. If AI comes, it's a quiet tool (e.g. "describe this palette"), never a chat panel. |
| **Feeds or "discover"** | Calm by design. Rediscover shows *your* clips, never an algorithm. |
| **Gamer aesthetic, RGB, sound packs** | Not the audience. Opera GX already owns it. |
| **Arc-level novelty** | Arc's own CEO said "too many new things to learn."\[41\] Every new Ezel concept must be useful in 10 seconds. |
| **Testing-lab scope** | Polypane does 80+ a11y tests.\[17\] Ezel does the 5 designers actually use. |
| **Accounts, sync, cloud (for now)** | Local-first. Export files instead. Revisit later. |

---

## 6. Signature features (the demo clips)

| # | Feature | The 30-second clip | Why it defines Ezel |
|---|---|---|---|
| 1 | **Loupe** | Hold Alt, glide over Stripe's homepage: fonts, colours and spacing float by. | "DevTools for designers": the core promise in one gesture. |
| 2 | **Palette Pull** | Right-click → Copy Palette → swatches drop in → paste as Tailwind config. | Instant, useful, shareable. |
| 3 | **Shelf + clips that remember** | Drag 3 images onto the Shelf. Search "blue". Click a clip → back to its source. | Pinterest + moodboard *inside* the browser. |
| 4 | **Tracing Paper** | Drop a Figma export onto localhost at 50% opacity, nudge 2 px, it's perfect. | Unique to a designer browser. Speaks to design engineers. |
| 5 | **Squint + Load meter** | Press S: page blurs. Then: "12 tabs, Ezel carrying 640 MB." | Fun lens plus the "doesn't eat your RAM" proof. |

---

## 7. Roadmap (solo-dev friendly)

| Phase | Goal | Ship | Build-in-public posts (cheap wins) |
|---|---|---|---|
| **1. Solid basics** | A browser you can daily-drive | Basics checklist, peek titlebar icons, recently closed tray, localhost tabs, quiet defaults, smart sleep, Load meter v1 | "Ezel vs Zen: same 12 tabs, RAM side by side" · peek titlebar GIF · sleepy-tab animation |
| **2. Signature tools** | "Oh, this is *for me*" | Pick Color, Contrast check, Squint/Greyscale, Loupe, Palette Pull, Type Report, Capture, Copy as…, viewport presets | One tool per week = one post per week. Squint and Greyscale first (1 day each). |
| **3. Collect & organise** | Replace Pinterest-in-a-tab | Shelf, clips that remember, auto-tags, search by colour, Spaces = boards, Rediscover, Glance, Tracing Paper, Paints | "Every clip remembers where it came from" · search-by-colour clip |
| **4. Make it yours** | Personality and community | Toolbox, Studio/Browse mode, Glaze (zap + colours + CSS), `.ezel` sharing, colour-blind sims, wireframe, dark/light forcing, split view | "Share your Glaze" thread on Reddit/Threads |
| **Later** | Depth | Devices view, Asset Grab, ruler/grid, annotate, revisit snapshots, board export, font/palette swap, visual diff, Little Ezel, content blocking, macOS | — |
| **Maybe** | Only if asked for | Stack sniff, inspo feed (own sources), Copy to Figma, reader view, sounds, Tools SDK | — |

**Order tips**

- Build the **inject-a-script-into-the-page** pipeline once (Phase 2). Loupe, Palette Pull, Type Report, Asset Grab, Glaze and Wireframe all reuse it.
- Build the **Chromium emulation** bridge once. Dark/light, reduced motion, colour-blind sims, viewport presets and throttling are all small calls through WebView2's DevTools Protocol method.
- Build **Capture** before Shelf. Shelf is mostly "Capture + metadata + a grid."

---

## 8. Competitive snapshot

| | Arc | Zen | Dia | Opera GX | Polypane | Sizzy | Kosmik | **Ezel** |
|---|---|---|---|---|---|---|---|---|
| **Status (Oct 2026)** | Maintenance only\[42\] | Active | Active (Atlassian)\[2\] | Active | Active (v31, Sep 2026)\[43\] | Active | Active | Building |
| **Price** | Free | Free | Free + $20/mo Pro\[2\] | Free | Paid, 14-day trial\[16\] | Paid | Paid after trial\[20\] | **Free** |
| **Engine** | Chromium | Firefox | Chromium | Chromium | Chromium | Chromium | Built-in browser | **WebView2 (Tauri)** |
| **Vertical tabs / Spaces** | ✅ | ✅ | Partial | Partial | — | — | — | ✅ |
| **Designer inspect tools** | — | — | — | — | ✅ (dev-leaning) | Partial | — | ✅ (designer-leaning) |
| **Moodboard / clips** | Easels | — | — | — | — | — | ✅ | ✅ |
| **Responsive / a11y** | — | — | — | — | ✅✅ | ✅ | — | ✅ (lite) |
| **Customisation** | Boosts | Mods | Minimal | Mods | — | — | — | Paints + Glazes |
| **AI-first** | No | No | Yes | Partial | No | No | Yes | **No** |
| **Lightness focus** | No | No | Yes | No | No | No | No | **Yes** |

**Ezel's spot:** the only free browser that is *calm, light, everyday-usable and built for designers*. Polypane is for building. Kosmik is for boards. Arc is frozen. Dia is AI. Zen is heavy.

---

## 9. Technical notes for the builder (plain language)

| Topic | Note |
|---|---|
| **Why Tauri helps** | In a Better Stack benchmark of the same app, Tauri's bundle was 57 MB vs Electron's 323 MB. Idle RAM was closer (109 MB vs 128 MB) once WebView helper processes were counted.\[44\] **Lesson:** Ezel's lightness comes from *tab discipline* (unloading, suspending), not just from Tauri. |
| **WebView2 memory knobs** | Microsoft documents `MemoryUsageTargetLevel = Low` for inactive WebViews and `TrySuspendAsync()` to pause a tab's renderer. Both are "best-effort."\[45\] In MicrosoftEdge/WebView2Feedback issue #2121, a developer running about 80 tabs on a 16 GB machine reported: "I tried to regulate memory using 'TrySuspendAsync' and 'MemoryUsageTargetLevel', I got practically no effect, the application hung and crashed." Keep your hard 8-tab unload limit as the real guarantee. |
| **Shared processes** | WebView2s that share a user data folder share one browser process. That saves memory, so keep all tabs in one environment (use profiles for private windows).\[46\]\[47\] |
| **Overlays vs native webviews** | Each tab is a native child window, so React UI can't draw *on top of* page content. Loupe, rulers, Tracing Paper and Lenses should be injected *into the page* (a shadow-DOM layer) or drawn in a transparent overlay window. |
| **Honest Load meter** | Measure via WebView2 process info per tab where possible.\[48\] If a number is shared or approximate, say so in the UI ("~"). Honesty is the feature. |

---

## Caveats

- **Extension popularity data** comes mostly from vendor-written listicles (Attention Insight, InspoAI, Bookmarkify, Hoverify all sell their own tools). The *overlap* between lists is reliable. Individual rankings are not.
- **Zen RAM complaints** are user reports on GitHub. Maintainers note high memory isn't necessarily a leak.\[49\] Use them as motivation, not as a benchmark. Run your own side-by-side test before posting comparisons.
- **Tauri vs Electron numbers** vary a lot by method. Some articles claim 30–40 MB idle for Tauri, but these often skip WebView helper processes.\[44\]\[50\]
- **WebView2 limits:** extension UI won't render, some Chromium features need DevTools Protocol calls, and memory APIs are best-effort. Prototype Loupe and Capture early to de-risk.
- **Scope risk:** this doc lists ~70 ideas. Arc's lesson is that *more* is not better. Ship Phases 1–2, watch what people clip and share, then decide.

## Sources

1. [How Do Chrome Extensions Impact Website Performance In 2024?](https://www.debugbear.com/blog/chrome-extensions-website-performance)
2. [Dia (web browser)](<https://en.wikipedia.org/wiki/Dia_(web_browser)>)
3. [Awesome-Design-Resources-List/README.md at main · darelova/Awesome-Design-Resources-List · GitHub](https://github.com/darelova/Awesome-Design-Resources-List/blob/main/README.md)
4. [Must-Have Chrome Extensions for UI/UX Designers (2026)](https://attentioninsight.com/best-chrome-extensions-ui-ux-designers-2026/)
5. [Best Chrome Extensions for UI/UX Designers in 2025 - GeeksforGeeks](https://www.geeksforgeeks.org/blogs/10-best-chrome-extensions-for-ui-ux-designers/)
6. [12 Best Chrome Extensions for UI/UX Designers (2026)](https://www.inspoai.io/blogs/best-chrome-extensions-ui-ux-designers)
7. [Best Chrome Extensions for UI/UX Designers in 2025](https://www.uinkits.com/blog-post/best-chrome-extensions-for-ui-ux-designers-in-2025)
8. [“Sleeper” browser extensions woke up as spyware on 4 million devices](https://www.malwarebytes.com/blog/news/2025/12/sleeper-browser-extensions-woke-up-as-spyware-on-4-million-devices)
9. [21 Chrome Extensions That Will Transform Your Frontend Workflow in 2026](https://tryhoverify.com/blog/21-chrome-extensions-that-will-transform-your-frontend-workflow-in-2025/)
10. [Polypane 2026 Pricing, Features, Reviews & Alternatives](https://www.getapp.com/development-tools-software/a/polypane/)
11. [The Browser Company mulls selling or open sourcing Arc Browser amid AI-focused pivot](https://techcrunch.com/2025/05/27/the-browser-company-mulls-selling-or-open-sourcing-arc-browser-amid-ai-focused-pivot/)
12. [Welcoming The Browser Company to Atlassian - Inside Atlassian](https://www.atlassian.com/blog/announcements/atlassian-acquires-the-browser-company)
13. [High Memory Usage · Issue #14569 · zen-browser/desktop · GitHub](https://github.com/zen-browser/desktop/issues/14569)
14. [Too much RAM Consumption · Issue #504 · zen-browser/desktop · GitHub](https://github.com/zen-browser/desktop/issues/504)
15. [Zen high memory usage · Issue #11216 · zen-browser/desktop · GitHub](https://github.com/zen-browser/desktop/issues/11216)
16. [Polypane, The browser for ambitious web developers](https://daily.dev/posts/polypane-the-browser-for-ambitious-web-developers-tkp4wkn0u)
17. [Polypane](https://crozdesk.com/software/polypane)
18. [Sizzy AlternativesWeb Debuggers & Web Browsers like Sizzy](https://alternativeto.net/software/sizzy)
19. [Software Alternatives, Accelerators & Startups](https://www.saashub.com/compare-sizzy-vs-browserstack)
20. [Can I use Kosmik for free? - Kosmik - Create Moodboard In Seconds With AI](https://www.kosmik.app/faq/can-i-use-kosmik-for-free)
21. [Arc Browser The Best Browser UX I've Ever](https://lumakes.com/en/articles/arc-workflow/)
22. [10 Best Design Inspiration Websites for Creatives (2025)](https://blog.streamlinehq.com/best-design-inspiration-websites/)
23. [Best Mobbin Alternatives for UI Inspiration in 2026](https://www.inspoai.io/blogs/mobbin-alternatives)
24. [Top 30 Chrome Extensions for UI/UX Designers in 2025](https://medium.com/@andrew-chornyy/top-30-chrome-extensions-for-ui-ux-designers-in-2025-86c43f409e39)
25. [Arc (web browser)](<https://en.wikipedia.org/wiki/Arc_(web_browser)>)
26. [Arc Boosts - WarrenWeb](https://blog.warrenweb.net/arc-boosts/)
27. [The Arc internet browser lets you customize (or vandalize) any website - Engadget](https://www.engadget.com/the-arc-internet-browser-lets-you-customize-or-vandalize-any-website-130010555.html)
28. [An update on plugin security](https://www.figma.com/blog/an-update-on-plugin-security/)
29. [Multi-Tenant Pluggable Widget Framework — Sujeet Jaiswal - Principal Software Engineer](https://sujeet.pro/articles/widget-framework)
30. [How Plugins Run](https://developers.figma.com/docs/plugins/how-plugins-run)
31. [Security](https://developers.raycast.com/information/security)
32. [Raycast vs Alfred - Why are people choosing Raycast over Alfred?](https://www.raycast.com/raycast-vs-alfred)
33. [Obsidian Shell Commands Abuse Shows a New Malware Playbook](https://www.penligent.ai/hackinglabs/obsidian-shell-commands-abuse-shows-a-new-malware-playbook/)
34. [anpigon's picture](https://huggingface.co/spaces/anpigon/obsidian-qa-bot/blob/84af0cbfd03597c4f288de37a1443f88c2861107/docs/obsidian-help/Extending%20Obsidian/Plugin%20security.md)
35. [File size: 2,350 Bytes](https://huggingface.co/spaces/anpigon/obsidian-qa-bot/blame/e272fa2f2c33a981360ec7e29f42e93f75fd504f/docs/obsidian-help/Extending%20Obsidian/Community%20plugins.md)
36. [GitHub - Meldiron/zen-mod: My collection of Zen Browser tweaks, installable with Sine · GitHub](https://github.com/Meldiron/zen-mod)
37. [how to upload my own zen mods · zen-browser/desktop · Discussion #9240 · GitHub](https://github.com/zen-browser/desktop/discussions/9240)
38. [Tip #9](https://vivaldi.com/blog/tips/tip-9/)
39. [CoreWebView2Profile.AddBrowserExtensionAsync(String) Method (Microsoft.Web.WebView2.Core)](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2profile.addbrowserextensionasync?view=webview2-dotnet-1.0.2903.40)
40. [WebView2 Win32 C++ ICoreWebView2Profile7](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7?view=webview2-1.0.4258.31)
41. [Is Arc Browser Dead? What Actually Happened (Updated May 2026)](https://supasidebar.com/blog/is-arc-browser-dead)
42. [The Browser Company stops active development of Arc in favor of new AI-focused product - Engadget](https://www.engadget.com/ai/the-browser-company-stops-active-development-of-arc-in-favor-of-new-ai-focused-product-153045276.html)
43. [Polypane. The browser for web developers who care.](https://polypane.app/)
44. [Tauri vs. Electron vs. Deno Desktop vs. Electrobun: A Practical Comparison](https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/)
45. [Performance best practices for WebView2 apps - Microsoft Edge Developer documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
46. [Support multiple profiles under a single user data folder - Microsoft Edge Developer documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/multi-profile-support)
47. [Process model for WebView2 apps - Microsoft Edge Developer documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)
48. [CoreWebView2Environment](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2environment?view=webview2-winrt-1.0.2365.46)
49. [Zen RAM Consumption is too much (Possible Memory Leak??) · Issue #8157 · zen-browser/desktop · GitHub](https://github.com/zen-browser/desktop/issues/8157)
50. [Tauri vs Electron Comparison: Choose the Right Framework](https://raftlabs.medium.com/tauri-vs-electron-a-practical-guide-to-picking-the-right-framework-5df80e360f26)
