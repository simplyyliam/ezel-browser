import { WindowFrame } from "@/shared/components"
import { Apptitlebar } from "@/widgets/app-titlebar/AppTitlebar"
import { Outlet } from "react-router-dom"

export default function AppLayout() {
  return (
    <WindowFrame titlebar={<Apptitlebar />}>
      <Outlet />
    </WindowFrame>
  )
}
