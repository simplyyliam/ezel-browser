import { useState } from "react"
import { RotateCw } from "lucide-react"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type UpdateNoteProps = {
  /** The version downloaded and waiting. */
  version: string
  /** Installs it: Ezel closes and the installer opens it again. */
  onRestart: () => void
}

/**
 * "Update ready · Restart": a calm line above the footer's actions once a new version has
 * downloaded in the background. Nothing restarts until it's clicked (HIG: people stay in control),
 * and nothing about it moves or pulses.
 */
export function UpdateNote({ version, onRestart }: UpdateNoteProps) {
  // One click is enough: the installer takes a moment to close Ezel.
  const [restarting, setRestarting] = useState(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          disabled={restarting}
          title={`Ezel ${version} is downloaded. Restart to apply it; your tabs come back.`}
          onClick={() => {
            setRestarting(true)
            onRestart()
          }}
          className="text-xs text-sidebar-foreground/70 [&_svg]:size-3.5"
        >
          <RotateCw aria-hidden />
          <span className="truncate">{restarting ? "Restarting…" : "Update ready"}</span>
          {!restarting && <span className="ml-auto text-sidebar-foreground/50">Restart to apply</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
