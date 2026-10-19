import { commands } from "@/shared/bindings"
import type { Id, Swatch } from "@/shared"

// The Swatches grid shows its tabs in slot order without gaps, so to the user it's a list: a drop
// inserts and the rest move along (Zen's essentials). The backend has 8 fixed slots and `move_tab`
// onto an occupied slot swaps. An insert is built from those moves: take a free slot, then swap
// swatches until slot order matches the new list. Each move emits `tabs-changed`; the grid shows
// the drag's arrangement until the last one is done (see useTabDrag's landing).

/** The swatches' tab ids in display order. */
export const swatchOrder = (swatches: Swatch[]) => swatches.flatMap((swatch) => (swatch ? [swatch.id] : []))

/** A tab from outside can join only while a slot is free. */
export const hasFreeSlot = (swatches: Swatch[]) => swatches.some((swatch) => swatch === null)

/**
 * Puts `tabId` at `index` among the other swatches (a swatch moves, any other tab joins), from the
 * slots as they are now. Rejects if a command fails, or if the grid is full and the tab isn't in it.
 */
export async function insertSwatch(tabId: Id, index: number, swatches: Swatch[]) {
  const slots = swatches.map((swatch) => swatch?.id ?? null)
  const order = swatchOrder(swatches).filter((id) => id !== tabId)
  order.splice(index, 0, tabId)

  const move = async (id: Id, slot: number) => {
    const result = await commands.moveTab(id, { kind: "swatch", slot })
    if (result.status === "error") throw result.error
    // What the backend did: an occupant swaps to where the tab came from.
    const from = slots.indexOf(id)
    if (from >= 0) slots[from] = slots[slot]
    slots[slot] = id
  }

  if (!slots.includes(tabId)) {
    const free = slots.indexOf(null)
    if (free < 0) throw new Error("Swatches are full")
    await move(tabId, free)
  }
  // Slot i holds the i-th swatch; free slots end up after the last one.
  for (const [slot, id] of order.entries()) {
    if (slots[slot] !== id) await move(id, slot)
  }
}
