// Measures how Ezel's UI copes with a big session (docs/perf/many-tabs.md).
//
// Needs a measurement build, UI instrumentation included (Git Bash):
//   VITE_EZEL_PERF=1 npx tauri build --no-bundle --features perf
// then, with no other Ezel running:
//   node scripts/measure-many-tabs.mjs [path/to/app.exe] [--label before] [--out results.json]
//
// It launches Ezel with `EZEL_PERF_URLS=seed` (perf::seed: 131 tabs over 6 spaces, favicons sized like
// a real Zen import, 4 loaded, in the throwaway `<app data>/ezel-perf` session), drives the UI over
// the perf build's local DevTools port (9333) and reads Rust's `ezel-perf` stderr notes (event and
// session-save sizes). Nothing leaves the machine except the 4 example.com tabs loading.
import { spawn, execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : null
}
const label = flag("--label") ?? "run"
const out = flag("--out")
const exe = path.resolve(args[0] ?? "src-tauri/target/release/app.exe")
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

// Never two instances.
const running = execSync('tasklist /FI "IMAGENAME eq app.exe" /FO CSV /NH').toString()
if (running.includes("app.exe")) {
  console.error("An app.exe is running (Ezel?). Close it first.")
  process.exit(1)
}

// WebView2 processes outlive a killed app; a new launch would join that old browser process (and
// its old UI page). With no Ezel running, any left with Ezel's data folder are a previous run's.
const killLeftoverWebViews = () =>
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedgewebview2.exe'\\" | Where-Object { $_.CommandLine -match 'com.ezel.dev' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
    { stdio: "ignore" },
  )
killLeftoverWebViews()

// ---- Launch, collecting Rust's notes ----
const notes = []
const started = Date.now()
const child = spawn(exe, [], { env: { ...process.env, EZEL_PERF_URLS: "seed" }, stdio: ["ignore", "ignore", "pipe"] })
let buffer = ""
child.stderr.on("data", (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    const m = /^ezel-perf (\S+) bytes=(\d+) us=(\d+)/.exec(line)
    if (m) notes.push({ at: Date.now() - started, what: m[1], bytes: +m[2], us: +m[3] })
  }
})
const stop = () => {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" })
  } catch {}
  try {
    killLeftoverWebViews()
  } catch {}
}
process.on("exit", stop)

// ---- DevTools connection to the `ui` webview ----
async function uiTarget() {
  for (let i = 0; i < 600; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const ui = list.find((t) => t.type === "page" && /^https?:\/\/tauri\.localhost/.test(t.url))
      if (ui) return ui
    } catch {}
    await sleep(100)
  }
  throw new Error("the UI's DevTools target never appeared (is this a perf build?)")
}
const target = await uiTarget()
console.error(`attached to the UI after ${Date.now() - started} ms`)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
let nextId = 1
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
/** Runs `fn` (source of an async function) in the UI and returns its JSON result. */
async function run(fn, ...fnArgs) {
  const r = await send("Runtime.evaluate", {
    expression: `(${fn})(...${JSON.stringify(fnArgs)})`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}

/** `run`, retried while the UI's page is still being replaced (only for idempotent waits). */
async function runSettled(fn, ...fnArgs) {
  for (let i = 0; ; i++) {
    try {
      return await run(fn, ...fnArgs)
    } catch (e) {
      if (i > 50 || !/context|Cannot find|undefined/i.test(String(e))) throw e
      await sleep(100)
    }
  }
}

// ---- Launch to interactive ----
const launch = await runSettled(async () => {
  const p = window.__ezelPerf
  if (!p) throw new Error("undefined __ezelPerf (not an instrumented build yet)")
  const limit = performance.now() + 90000
  while (!p.marks["sidebar-ready"]) {
    if (performance.now() > limit) return { timedOut: "sidebar-ready", longTasks: p.longTasks.map((t) => Math.round(t.duration)) }
    await new Promise((r) => setTimeout(r, 20))
  }
  // Interactive: the first moment after the rows show with no long task for 1s.
  let quietSince = performance.now()
  for (;;) {
    if (performance.now() > limit) return { timedOut: "quiet", longTasks: p.longTasks.map((t) => Math.round(t.duration)) }
    const last = p.longTasks.at(-1)
    const lastEnd = last ? last.at + last.duration : 0
    if (performance.now() - Math.max(lastEnd, p.marks["sidebar-ready"]) > 1000) {
      quietSince = Math.max(lastEnd, p.marks["sidebar-ready"])
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return {
    origin: performance.timeOrigin,
    ready: p.marks["sidebar-ready"],
    interactive: quietSince,
    longTasks: p.longTasks.filter((t) => t.at <= quietSince).map((t) => Math.round(t.duration)),
  }
})
if (launch.timedOut) {
  console.error(`launch never settled (${launch.timedOut}); long tasks: ${launch.longTasks.length}, total ${launch.longTasks.reduce((a, b) => a + b, 0)} ms`)
  console.error(JSON.stringify(notes.slice(-20)))
  stop()
  process.exit(2)
}
const launchResult = {
  sidebarShownMs: Math.round(launch.origin + launch.ready - started),
  interactiveMs: Math.round(launch.origin + launch.interactive - started),
  longTasksMs: launch.longTasks,
}
console.error(`launch: rows shown ${launchResult.sidebarShownMs} ms, interactive ${launchResult.interactiveMs} ms`)

// Let the 4 seed tabs load (one a second) and the page settle.
await sleep(7000)

// Dock the sidebar (Ctrl+B) so it's visible and laid out.
const docked = await run(async () => {
  const expanded = () => !!document.querySelector('[data-slot="sidebar"][data-state="expanded"]')
  if (!expanded()) document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", ctrlKey: true, bubbles: true }))
  await new Promise((r) => setTimeout(r, 500))
  return expanded()
})
console.error(`sidebar docked: ${docked}`)
await sleep(1500)

// ---- Helpers in the page ----
await run(async () => {
  const p = window.__ezelPerf
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  p.state = async () => {
    const r = await p.commands.getTabs()
    return r.data
  }
  /** Runs `action`, then waits for its React commit and the frame after it: ms, rows rendered, commit ms. */
  p.time = async (action) => {
    const rows0 = p.counts.row ?? 0
    const c0 = p.commits.length
    const t0 = performance.now()
    await action()
    const deadline = performance.now() + 3000
    while (p.commits.length === c0 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 1))
    await frames()
    const commits = p.commits.slice(c0)
    return {
      ms: performance.now() - t0,
      rows: (p.counts.row ?? 0) - rows0,
      commitMs: commits.reduce((a, c) => a + c.duration, 0),
    }
  }
})

const repeat = async (n, fnSource) => {
  const results = []
  for (let i = 0; i < n; i++) {
    results.push(await run(fnSource, i))
    await sleep(300)
  }
  return {
    ms: round(median(results.map((r) => r.ms))),
    rows: median(results.map((r) => r.rows)),
    commitMs: round(median(results.map((r) => r.commitMs))),
  }
}

// ---- Switching tabs (by clicking rows, between the 4 loaded ones) ----
const switchTab = await repeat(8, async (i) => {
  const p = window.__ezelPerf
  const s = await p.state()
  const space = s.spaces.find((x) => x.id === s.activeSpaceId)
  const loaded = space.tempTabs.filter((t) => t.isLoaded && t.id !== s.activeTabId)
  const tab = loaded[i % loaded.length]
  const row = document.querySelector(`[data-tab-id="${tab.id}"]`)
  return p.time(async () => {
    row.click()
    while (!row.matches('[aria-current="page"]')) await new Promise((r) => setTimeout(r, 1))
  })
})

// ---- Switching spaces ----
const switchSpace = await repeat(6, async (i) => {
  const p = window.__ezelPerf
  const s = await p.state()
  const others = s.spaces.filter((x) => x.id !== s.activeSpaceId)
  const space = others[i % others.length]
  const first = space.items.find((it) => it.kind === "tab")?.tab
  return p.time(async () => {
    await p.commands.switchSpace(space.id)
    while (!document.querySelector(`[data-tab-id="${first.id}"]`)) await new Promise((r) => setTimeout(r, 1))
  })
})
// Back to the first space (where the loaded tabs are).
await run(async () => {
  const p = window.__ezelPerf
  const s = await p.state()
  await p.commands.switchSpace(s.spaces[0].id)
})
await sleep(800)

// ---- Opening and closing a tab ----
const openTab = []
const closeTab = []
for (let i = 0; i < 5; i++) {
  const r = await run(async (i) => {
    const p = window.__ezelPerf
    let id = null
    const open = await p.time(async () => {
      id = (await p.commands.openTab(`https://example.com/?opened=${i}`)).data
    })
    await new Promise((r) => setTimeout(r, 1500))
    const close = await p.time(async () => {
      await p.commands.closeTab(id)
    })
    return { open, close }
  }, i)
  openTab.push(r.open)
  closeTab.push(r.close)
  await sleep(500)
}
const summarize = (xs) => ({
  ms: round(median(xs.map((r) => r.ms))),
  rows: median(xs.map((r) => r.rows)),
  commitMs: round(median(xs.map((r) => r.commitMs))),
})

// ---- One tab changes ----
// A single `tab-updated` (Rust's per-tab event): reload the shown tab and count rows per event.
const oneTabUpdated = await run(async () => {
  const p = window.__ezelPerf
  let events = 0
  const unlisten = await p.events.tabUpdated.listen(() => events++)
  const rows0 = p.counts.row ?? 0
  await p.commands.reload()
  await new Promise((r) => setTimeout(r, 2500))
  unlisten()
  const rows = (p.counts.row ?? 0) - rows0
  return { events, rows, rowsPerEvent: events ? rows / events : null }
})
// One tab's state changed through a whole-state `tabs-changed` (mute an unloaded tab, then unmute).
const oneTabChanged = await run(async () => {
  const p = window.__ezelPerf
  const s = await p.state()
  const space = s.spaces.find((x) => x.id === s.activeSpaceId)
  const tab = space.tempTabs.find((t) => !t.isLoaded) ?? space.tempTabs[0]
  const a = await p.time(() => p.commands.setTabMuted(tab.id, true))
  await new Promise((r) => setTimeout(r, 300))
  const b = await p.time(() => p.commands.setTabMuted(tab.id, false))
  return { rows: (a.rows + b.rows) / 2, ms: (a.ms + b.ms) / 2, commitMs: (a.commitMs + b.commitMs) / 2 }
})

// ---- Idle: what happens with nobody touching anything (load meter, unloader tick) ----
const idleStart = Date.now() - started
const idle = await run(async () => {
  const p = window.__ezelPerf
  const rows0 = p.counts.row ?? 0
  const c0 = p.commits.length
  const l0 = p.longTasks.length
  await new Promise((r) => setTimeout(r, 20000))
  return {
    rows: (p.counts.row ?? 0) - rows0,
    commits: p.commits.length - c0,
    longTasks: p.longTasks.slice(l0).map((t) => Math.round(t.duration)),
  }
})
const idleEnd = Date.now() - started

// ---- Frame rate: scrolling the sidebar, dragging a tab ----
const box = await run(async () => {
  const content = document.querySelector('[data-sidebar="content"]')
  const scroller = [...content.querySelectorAll("*")].find((el) => {
    const o = getComputedStyle(el).overflowY
    return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight
  })
  const r = (scroller ?? content).getBoundingClientRect()
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    scrollRange: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
  }
})
/** The first temp tab's row centre, scrolled into view first (the scroll test leaves the list anywhere). */
const dragRow = () =>
  run(async () => {
    const s = await window.__ezelPerf.state()
    const space = s.spaces.find((x) => x.id === s.activeSpaceId)
    const row = document.querySelector(`[data-tab-id="${space.tempTabs[0].id}"]`)
    if (!row) return null
    row.scrollIntoView({ block: "center" })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const rr = row.getBoundingClientRect()
    return { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 }
  })
const startFrames = () =>
  run(async () => {
    const p = window.__ezelPerf
    p.frameTimes = []
    p.counting = true
    const tick = (t) => {
      p.frameTimes.push(t)
      if (p.counting) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    p.rowsAtFrames = p.counts.row ?? 0
  })
const stopFrames = () =>
  run(async () => {
    const p = window.__ezelPerf
    p.counting = false
    const t = p.frameTimes
    const gaps = t.slice(1).map((x, i) => x - t[i])
    const sorted = [...gaps].sort((a, b) => a - b)
    return {
      fps: gaps.length ? (gaps.length * 1000) / (t.at(-1) - t[0]) : null,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      worstFrameMs: sorted.at(-1) ?? null,
      droppedOver33ms: gaps.filter((g) => g > 33.4).length,
      rows: (p.counts.row ?? 0) - p.rowsAtFrames,
    }
  })
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...extra })

await startFrames()
for (let i = 0; i < 90; i++) {
  await mouse("mouseWheel", box.x, box.y, { deltaX: 0, deltaY: i < 45 ? 60 : -60 })
  await sleep(16)
}
await sleep(200)
const scroll = { ...(await stopFrames()), scrollRangePx: Math.round(box.scrollRange) }

let drag = null
const row = await dragRow()
if (row) {
  const { x, y } = row
  await mouse("mouseMoved", x, y)
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 })
  await startFrames()
  for (let i = 1; i <= 60; i++) {
    await mouse("mouseMoved", x, y - i * 4, { button: "left", buttons: 1 })
    await sleep(16)
  }
  // The dragged row dims in place while a drag runs (DraggableTabItem).
  const started = await run(async () => !!document.querySelector('[data-sidebar="content"] .opacity-40'))
  for (let i = 59; i >= 0; i--) {
    await mouse("mouseMoved", x, y - i * 4, { button: "left", buttons: 1 })
    await sleep(16)
  }
  drag = { ...(await stopFrames()), dragStarted: started ? 1 : 0 }
  await mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 })
}

// ---- Rust's notes ----
const byKind = (from, to) => {
  const kinds = {}
  for (const n of notes) {
    if (n.at < from || n.at > to) continue
    const k = (kinds[n.what] ??= { count: 0, bytes: [], us: [] })
    k.count++
    k.bytes.push(n.bytes)
    k.us.push(n.us)
  }
  return Object.fromEntries(
    Object.entries(kinds).map(([what, k]) => [
      what,
      { count: k.count, medianBytes: median(k.bytes), maxBytes: Math.max(...k.bytes), medianUs: median(k.us), maxUs: Math.max(...k.us) },
    ]),
  )
}

const result = {
  label,
  at: new Date().toISOString(),
  launch: launchResult,
  switchTab,
  switchSpace,
  openTab: summarize(openTab),
  closeTab: summarize(closeTab),
  oneTabUpdated,
  oneTabChanged: { rows: oneTabChanged.rows, ms: round(oneTabChanged.ms), commitMs: round(oneTabChanged.commitMs) },
  idle20s: { ...idle, rust: byKind(idleStart, idleEnd) },
  scroll: Object.fromEntries(Object.entries(scroll).map(([k, v]) => [k, round(v)])),
  drag: drag && Object.fromEntries(Object.entries(drag).map(([k, v]) => [k, round(v)])),
  rustWholeRun: byKind(0, Infinity),
}
ws.close()
stop()
const json = JSON.stringify(result, null, 2)
if (out) writeFileSync(out, json)
console.log(json)
process.exit(0)
