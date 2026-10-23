import { useEffect, useState } from "react"
import { events } from "./bindings"

/** The shown page's status text (a hovered link's address), "" when there's none. */
export function useLinkStatus() {
  const [text, setText] = useState("")
  useEffect(() => {
    const unlisten = events.linkStatus.listen((event) => setText(event.payload.text))
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
  return text
}
