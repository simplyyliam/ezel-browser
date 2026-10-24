import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SpaceIcon } from "@/shared/components"
import type { Id, Space, Tab } from "@/shared"

/** Every tab a space holds: pinned, in folders, temp. */
function spaceTabs(space: Space): Tab[] {
  return [...space.items.flatMap((item) => (item.kind === "tab" ? [item.tab] : item.folder.tabs)), ...space.tempTabs]
}

/**
 * Deleting a space with tabs asks first (HIG alerts.md: uncommon, and its tabs are at stake), and
 * asks what happens to them: they move to another space (the default, nothing is lost) or close
 * with it. An empty space goes without a question.
 */
export function DeleteSpaceAlert({
  space,
  spaces,
  open,
  onOpenChange,
  onDelete,
}: {
  space: Space
  spaces: Space[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (moveTo: Id | null) => void
}) {
  const others = spaces.filter((s) => s.id !== space.id)
  // The space that shows next (the one before it, or after the first): where its tabs go by default.
  const index = spaces.findIndex((s) => s.id === space.id)
  const neighbour = spaces[index === 0 ? 1 : index - 1] ?? others[0]
  const [targetId, setTargetId] = useState<Id | null>(null)
  const target = others.find((s) => s.id === targetId) ?? neighbour
  const tabCount = spaceTabs(space).length
  const folderCount = space.items.filter((item) => item.kind === "folder").length
  const contents = [
    tabCount > 0 && `${tabCount} ${tabCount === 1 ? "tab" : "tabs"}`,
    folderCount > 0 && `${folderCount} ${folderCount === 1 ? "folder" : "folders"}`,
  ].filter(Boolean)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* The default size: three buttons in one row. */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{space.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its {contents.join(" and ")} can move to another space, or close with it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {others.length > 1 && target && (
          // A pop-up button: which space gets them (HIG pop-up-buttons.md).
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Move them to</span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <SpaceIcon icon={target.icon} />
                <span className="truncate">{target.name}</span>
                <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuRadioGroup value={target.id} onValueChange={(id: Id) => setTargetId(id)}>
                  {others.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id}>
                      <SpaceIcon icon={s.icon} />
                      <span className="truncate">{s.name}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* Closing loses the tabs (Ctrl+Shift+T can still bring them back): not the default. */}
          <AlertDialogAction variant="outline" onClick={() => onDelete(null)}>
            Close Tabs
          </AlertDialogAction>
          {target && (
            <AlertDialogAction onClick={() => onDelete(target.id)}>
              {others.length > 1 ? "Move and Delete" : `Move to “${target.name}”`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
