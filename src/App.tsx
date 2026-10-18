import { RouterProvider } from "react-router-dom"
import { RouterBrowser } from "./router/router"
import { ThemeProvider } from "./theme"

export default function App() {
  return (
    // Follows the OS until a theme is picked. No persistence yet (MVP): add storageKey to keep it.
    <ThemeProvider defaultTheme="system">
      <RouterProvider router={RouterBrowser} />
    </ThemeProvider>
  )
}
