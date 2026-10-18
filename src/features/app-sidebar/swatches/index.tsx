import { Favicon } from "@/shared/components"
import type { Swatch } from "@/shared"

/** The grid holds at most 8 swatches: 4 columns x 2 rows. */
const MAX_SWATCHES = 8

type SwatchesProps = {
  swatches: Swatch[]
}

/** The top grid of pinned favourites. Placeholder only: clicking does nothing yet. */
export function Swatches({ swatches }: SwatchesProps) {
  return (
    <ul aria-label="Swatches" className="grid grid-cols-[repeat(4,52px)] justify-between gap-y-1">
      {swatches.slice(0, MAX_SWATCHES).map((swatch) => (
        <li key={swatch.id}>
          {/* TODO: open the swatch's tab once real tab state exists. */}
          <button
            type="button"
            aria-label={swatch.tab?.title ?? "Empty swatch"}
            className="flex h-[31px] w-[52px] items-center justify-center rounded-[9px] bg-sidebar-foreground/5 outline-none transition-colors hover:bg-sidebar-foreground/8 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {swatch.tab && <Favicon src={swatch.tab.favicon} className="size-[18px]" />}
          </button>
        </li>
      ))}
    </ul>
  )
}
