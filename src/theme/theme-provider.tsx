import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import {
  createThemeStore,
  localStorageAdapter,
  type ResolvedTheme,
  type Theme,
  type ThemeState,
  type ThemeStore,
} from "./theme-store"

const ThemeContext = createContext<ThemeStore | null>(null)

type ThemeProviderProps = {
  children: ReactNode
  /** Used until the user picks one (or when nothing is saved). */
  defaultTheme?: Theme
  /** Persist the picked theme to localStorage under this key. Omitted: no persistence (MVP). */
  storageKey?: string
}

/** Provides the theme store. Mount once, around the whole app. */
export function ThemeProvider({ children, defaultTheme = "system", storageKey }: ThemeProviderProps) {
  // One store for the provider's lifetime; props are read on creation.
  const [store] = useState(() =>
    createThemeStore({ defaultTheme, storage: storageKey ? localStorageAdapter(storageKey) : undefined }),
  )
  useEffect(() => store.connect(), [store])
  return <ThemeContext.Provider value={store}>{children}</ThemeContext.Provider>
}

function useThemeStore(): ThemeStore {
  const store = useContext(ThemeContext)
  if (!store) throw new Error("useTheme must be used within a ThemeProvider.")
  return store
}

/**
 * Reads one slice of the theme state. The component re-renders only when that slice changes, e.g.
 * `useThemeSelector((s) => s.resolvedTheme)`. Return primitives or stable references from `select`.
 */
export function useThemeSelector<T>(select: (state: ThemeState) => T): T {
  const store = useThemeStore()
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
}

/** The full theme state plus its actions. */
export function useTheme(): ThemeState & Pick<ThemeStore, "setTheme" | "setTokens" | "replaceTokens"> {
  const store = useThemeStore()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...state, setTheme: store.setTheme, setTokens: store.setTokens, replaceTokens: store.replaceTokens }
}

/** Just "light" | "dark", for components that only need to know which one is showing. */
export const useResolvedTheme = (): ResolvedTheme => useThemeSelector((s) => s.resolvedTheme)
