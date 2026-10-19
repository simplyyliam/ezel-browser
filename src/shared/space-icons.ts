import {
  BookOpen,
  Briefcase,
  Brush,
  Camera,
  Code,
  Coffee,
  Component,
  Film,
  Frame,
  Globe,
  GraduationCap,
  Hammer,
  Heart,
  House,
  Image,
  Layers,
  LayoutGrid,
  Music,
  Palette,
  PenTool,
  Pipette,
  Plane,
  Ruler,
  Shapes,
  ShoppingBag,
  Sparkles,
  Stamp,
  Star,
  SwatchBook,
  Type,
  type LucideIcon,
} from "lucide-react"

// Spaces store a lucide icon name. Only these are bundled (importing every lucide icon would
// add ~1MB); an unknown name falls back to `Layers`. Design tools come first: Ezel is for designers.
const SPACE_ICONS: Record<string, LucideIcon> = {
  house: House,
  palette: Palette,
  "swatch-book": SwatchBook,
  "pen-tool": PenTool,
  brush: Brush,
  pipette: Pipette,
  type: Type,
  shapes: Shapes,
  frame: Frame,
  component: Component,
  "layout-grid": LayoutGrid,
  ruler: Ruler,
  image: Image,
  camera: Camera,
  film: Film,
  sparkles: Sparkles,
  stamp: Stamp,
  layers: Layers,
  code: Code,
  hammer: Hammer,
  briefcase: Briefcase,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  globe: Globe,
  plane: Plane,
  "shopping-bag": ShoppingBag,
  music: Music,
  coffee: Coffee,
  heart: Heart,
  star: Star,
}

export const spaceIcon = (name: string): LucideIcon => SPACE_ICONS[name] ?? Layers

/** Every icon a space can take, in picker order. */
export const SPACE_ICON_NAMES = Object.keys(SPACE_ICONS)

/** Icons handed to new spaces in turn (the default space is `house`). */
export const NEW_SPACE_ICONS = SPACE_ICON_NAMES.filter((name) => name !== "house")
