import { RouterProvider } from "react-router-dom"
import { RouterBrowser } from "./router/router"

export default function App() {
  return <RouterProvider router={RouterBrowser}/>
}
