import { Hammer, Palette, Stamp } from "lucide-react"
import type { Space, Swatch, Tab } from "@/shared"

// TODO: placeholder only. Replaced by real tab, folder and space state in the tabs step.
// Duplicate names and avatars are intentional mock content from docs/design/sidebar-1.png.

const vinz = (id: string): Tab => ({
  id,
  title: "Vinz",
  url: "https://dribbble.com",
  favicon: "https://dribbble.com/favicon.ico",
})

export const PLACEHOLDER_SWATCHES: Swatch[] = [
  {
    id: "swatch-1",
    tab: { id: "swatch-tab-1", title: "Claude", url: "https://claude.ai", favicon: "https://claude.ai/favicon.ico" },
  },
  ...Array.from({ length: 7 }, (_, i): Swatch => ({ id: `swatch-${i + 2}`, tab: null })),
]

export const PLACEHOLDER_SPACES: Space[] = [
  {
    id: "design-work",
    name: "Design Work",
    icon: Palette,
    items: [
      {
        kind: "folder",
        folder: {
          id: "portfolio-inspiration",
          name: "Portfolio Inspiration",
          tabs: [
            vinz("tab-vinz-1"),
            {
              id: "tab-simplyliam",
              title: "Simplyliam",
              url: "https://github.com",
              favicon: "https://github.com/favicon.ico",
            },
            vinz("tab-vinz-2"),
            vinz("tab-vinz-3"),
          ],
        },
      },
    ],
  },
  {
    id: "branding",
    name: "Branding",
    icon: Stamp,
    items: [
      {
        kind: "tab",
        tab: { id: "tab-figma", title: "Figma", url: "https://figma.com", favicon: "https://www.figma.com/favicon.ico" },
      },
      {
        kind: "folder",
        folder: {
          id: "type-specimens",
          name: "Type Specimens",
          tabs: [
            {
              id: "tab-fonts",
              title: "Google Fonts",
              url: "https://fonts.google.com",
              favicon: "https://fonts.google.com/favicon.ico",
            },
          ],
        },
      },
    ],
  },
  {
    id: "build",
    name: "Build",
    icon: Hammer,
    items: [
      {
        kind: "tab",
        tab: { id: "tab-tauri", title: "Tauri", url: "https://tauri.app", favicon: "https://tauri.app/favicon.svg" },
      },
      {
        kind: "tab",
        tab: { id: "tab-shadcn", title: "shadcn/ui", url: "https://ui.shadcn.com", favicon: "https://ui.shadcn.com/favicon.ico" },
      },
    ],
  },
]

export const PLACEHOLDER_TEMP_TABS: Tab[] = [
  { id: "temp-hyper-browser", title: "Hyper Browser", url: "https://duckduckgo.com", favicon: null },
]

/** The design shows "Simplyliam" as the active tab. */
export const PLACEHOLDER_ACTIVE_TAB_ID = "tab-simplyliam"
