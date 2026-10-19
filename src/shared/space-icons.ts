import {
  BookOpen,
  Briefcase,
  Code,
  Coffee,
  Globe,
  Hammer,
  House,
  Layers,
  Music,
  Palette,
  Stamp,
  Star,
  type LucideIcon,
} from "lucide-react"

// Spaces store a lucide icon name. Only these are bundled (importing every lucide icon would
// add ~1MB); an unknown name falls back to `Layers`. Add names here as the icon picker grows.
const SPACE_ICONS: Record<string, LucideIcon> = {
  house: House,
  palette: Palette,
  stamp: Stamp,
  hammer: Hammer,
  briefcase: Briefcase,
  "book-open": BookOpen,
  code: Code,
  globe: Globe,
  music: Music,
  coffee: Coffee,
  star: Star,
  layers: Layers,
}

export const spaceIcon = (name: string): LucideIcon => SPACE_ICONS[name] ?? Layers

/** Icons handed to new spaces in turn (the default space is `house`). */
export const NEW_SPACE_ICONS = Object.keys(SPACE_ICONS).filter((name) => name !== "house")
