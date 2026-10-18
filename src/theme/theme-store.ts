/**
 * Framework-agnostic theme state. Applies the theme to the document as shadcn expects (the `dark`
 * class on <html>, see `@custom-variant dark` in index.css) and layers optional token overrides on
 * top of shadcn's `:root` / `.dark` variables, so a theme editor can recolour the app at runtime
 * without touching index.css or re-rendering React.
 */

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

/** CSS custom properties from index.css, e.g. `{ "--primary": "oklch(0.6 0.2 260)" }`. */
export type ThemeTokens = Partial<Record<`--${string}`, string>>

/** Per-mode overrides; each applies only while that mode is active. */
export type TokenOverrides = Partial<Record<ResolvedTheme, ThemeTokens>>

export type ThemeState = {
  /** What the user picked. */
  theme: Theme
  /** What's showing: `theme`, with "system" resolved. */
  resolvedTheme: ResolvedTheme
  /** The OS preference, tracked live. */
  systemTheme: ResolvedTheme
  tokens: TokenOverrides
}

/** Where the picked theme is saved. Omit for no persistence. */
export interface ThemeStorage {
  get(): Theme | null
  set(theme: Theme): void
  /** Calls back when another window changes the saved theme; returns an unsubscribe. */
  subscribe?(onChange: (theme: Theme | null) => void): () => void
}

export interface ThemeStore {
  getSnapshot(): ThemeState
  subscribe(listener: () => void): () => void
  setTheme(theme: Theme): void
  /** Merges into the current overrides; pass `undefined` for a token to drop it. */
  setTokens(tokens: TokenOverrides): void
  /** Replaces all overrides (`{}` resets to index.css). */
  replaceTokens(tokens: TokenOverrides): void
  /** Starts applying to the document and following the OS. Returns a disconnect. */
  connect(): () => void
}

const THEMES: readonly Theme[] = ["light", "dark", "system"]
export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme)

const DARK_QUERY = "(prefers-color-scheme: dark)"
const systemTheme = (): ResolvedTheme => (matchMedia(DARK_QUERY).matches ? "dark" : "light")

/** Persists to localStorage under `key` and syncs across windows. Safe when storage is unavailable. */
export function localStorageAdapter(key: string): ThemeStorage {
  return {
    get() {
      try {
        const value = localStorage.getItem(key)
        return isTheme(value) ? value : null
      } catch {
        return null
      }
    },
    set(theme) {
      try {
        localStorage.setItem(key, theme)
      } catch {
        // Storage full or blocked: the theme still applies for this session.
      }
    },
    subscribe(onChange) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange(isTheme(event.newValue) ? event.newValue : null)
      }
      window.addEventListener("storage", onStorage)
      return () => window.removeEventListener("storage", onStorage)
    },
  }
}

/** Renders overrides as rules that out-rank index.css's `:root` / `.dark` (0,1,0) without !important. */
function tokensToCss(tokens: TokenOverrides): string {
  const block = (selector: string, map: ThemeTokens | undefined) => {
    const decls = Object.entries(map ?? {})
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name, value]) => `${name}:${value};`)
      .join("")
    return decls ? `${selector}{${decls}}` : ""
  }
  return block(":root:not(.dark)", tokens.light) + block(":root.dark", tokens.dark)
}

/** Stops every CSS transition for one frame, so a theme switch doesn't animate colours everywhere. */
function withoutTransitions(apply: () => void) {
  const style = document.createElement("style")
  style.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(style)
  apply()
  // Force a style flush with transitions off, then restore them.
  void getComputedStyle(document.documentElement).opacity
  requestAnimationFrame(() => style.remove())
}

export function createThemeStore({
  defaultTheme = "system",
  storage,
  root = document.documentElement,
}: {
  defaultTheme?: Theme
  storage?: ThemeStorage
  root?: HTMLElement
} = {}): ThemeStore {
  const resolve = (theme: Theme, system: ResolvedTheme): ResolvedTheme => (theme === "system" ? system : theme)

  const initialSystem = systemTheme()
  const initialTheme = storage?.get() ?? defaultTheme
  let state: ThemeState = {
    theme: initialTheme,
    resolvedTheme: resolve(initialTheme, initialSystem),
    systemTheme: initialSystem,
    tokens: {},
  }

  const listeners = new Set<() => void>()
  let connected = false
  let tokenStyle: HTMLStyleElement | null = null

  /** `initial`: first paint after connect, nothing to protect from transitions yet. */
  const applyMode = (initial: boolean) => {
    const run = () => {
      root.classList.toggle("dark", state.resolvedTheme === "dark")
      // Native form controls and scrollbars follow too.
      root.style.colorScheme = state.resolvedTheme
    }
    if (initial) run()
    else withoutTransitions(run)
  }

  const applyTokens = () => {
    const css = tokensToCss(state.tokens)
    if (!css) {
      tokenStyle?.remove()
      tokenStyle = null
      return
    }
    if (!tokenStyle) {
      tokenStyle = document.createElement("style")
      tokenStyle.dataset.themeTokens = ""
    }
    tokenStyle.textContent = css
    // Last in <head>, after index.css.
    document.head.appendChild(tokenStyle)
  }

  const set = (patch: Partial<ThemeState>) => {
    const next = { ...state, ...patch }
    next.resolvedTheme = resolve(next.theme, next.systemTheme)
    const modeChanged = next.resolvedTheme !== state.resolvedTheme
    const tokensChanged = next.tokens !== state.tokens
    if (!modeChanged && !tokensChanged && next.theme === state.theme && next.systemTheme === state.systemTheme) {
      return
    }
    state = next
    if (connected) {
      if (modeChanged) applyMode(false)
      if (tokensChanged) applyTokens()
    }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setTheme(theme) {
      if (!isTheme(theme)) return
      storage?.set(theme)
      set({ theme })
    },
    setTokens(tokens) {
      const merged: TokenOverrides = { ...state.tokens }
      for (const mode of ["light", "dark"] as const) {
        if (tokens[mode]) merged[mode] = { ...state.tokens[mode], ...tokens[mode] }
      }
      set({ tokens: merged })
    },
    replaceTokens(tokens) {
      set({ tokens: { ...tokens } })
    },
    connect() {
      connected = true
      // The OS may have changed since the store was created (e.g. while a window was hidden).
      set({ systemTheme: systemTheme() })
      applyMode(true)
      applyTokens()

      const media = matchMedia(DARK_QUERY)
      const onSystemChange = () => set({ systemTheme: media.matches ? "dark" : "light" })
      media.addEventListener("change", onSystemChange)
      const unsubscribeStorage = storage?.subscribe?.((theme) => set({ theme: theme ?? defaultTheme }))

      return () => {
        connected = false
        media.removeEventListener("change", onSystemChange)
        unsubscribeStorage?.()
        tokenStyle?.remove()
        tokenStyle = null
      }
    },
  }
}
