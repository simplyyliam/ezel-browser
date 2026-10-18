import { Outlet } from "react-router-dom"

export default function StandaloneLayout() {
  return (
    <div className="min-h-0 flex-1">
      <Outlet />
    </div>
  )
}
