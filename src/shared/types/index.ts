import type { LucideIcon } from "lucide-react"

/** A tab as the sidebar shows it. */
export type Tab = {
  id: string
  title: string
  url: string
  /** Favicon URL; null shows the grey-circle placeholder. */
  favicon: string | null
}

export type Folder = {
  id: string
  name: string
  tabs: Tab[]
}

/** A space's list mixes folders and standalone tabs. */
export type SpaceItem = { kind: "folder"; folder: Folder } | { kind: "tab"; tab: Tab }

export type Space = {
  id: string
  name: string
  icon: LucideIcon
  items: SpaceItem[]
}

/** One cell of the Swatches grid (max 8); an empty cell has no tab. */
export type Swatch = {
  id: string
  tab: Tab | null
}
