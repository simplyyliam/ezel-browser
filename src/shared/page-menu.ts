import { useEffect, useState } from "react"
import { commands, events, type PageMenu, type PageMenuAction } from "./bindings"
import { unwrap } from "./report-error"

/**
 * The website's right-click menu (Rust: `browser/page_menu.rs`). `page-menu` opens it at a window
 * point; `close` sends the choice, or null, exactly once per menu (WebView2 waits for it).
 */
export function usePageMenu() {
  const [menu, setMenu] = useState<PageMenu | null>(null)

  useEffect(() => {
    const unlisten = events.pageMenu.listen((event) => setMenu(event.payload))
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  /** Closes menu `id` (a newer one may already be open: it stays). */
  const close = (id: number, action: PageMenuAction | null) => {
    setMenu((current) => (current?.id === id ? null : current))
    unwrap("page menu", commands.choosePageMenuItem(id, action))
  }

  return { menu, close }
}
