import { WindowFrame } from "@/shared/components"
import { AppTitlebar } from "@/widgets/app-titlebar/AppTitlebar"
import { Outlet } from "react-router-dom"

export default function AppLayout() {
  return (
    <WindowFrame titlebar={<AppTitlebar />}>
      <Outlet />
    </WindowFrame>
  )
}
