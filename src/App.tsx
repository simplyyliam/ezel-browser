import { Toolbar } from "@/widgets/toolbar"
import { RouterProvider } from "react-router"
import { RouterBrowser } from "./router/router"

export default function App() {
  return <RouterProvider router={RouterBrowser}/>
}