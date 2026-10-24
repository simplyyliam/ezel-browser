import { createElement } from "react";
import { cn } from "@/lib/utils";
import { isEmojiIcon, spaceIcon } from "../../space-icons";

/** index.css `--font-emoji`: the system's colour emoji. */
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";

/** Each emoji's correction, in em, measured once. A space has one emoji, so this stays small. */
const offsets = new Map<string, { x: number; y: number }>();
let context: CanvasRenderingContext2D | null | undefined;

/**
 * How far an emoji's drawing sits from the middle of its text box, in em. Emoji fonts don't draw
 * in the middle of their line (Segoe UI Emoji sits low and spills right), so a box centred by CSS
 * still shows the emoji off-centre. The canvas measures the ink itself; the span moves by the
 * difference, so every emoji lands in the middle of its icon's box.
 */
function inkOffset(emoji: string) {
  const known = offsets.get(emoji);
  if (known) return known;
  if (context === undefined) context = document.createElement("canvas").getContext("2d");
  if (!context) return { x: 0, y: 0 };
  const size = 100;
  context.font = `${size}px ${EMOJI_FONT}`;
  const m = context.measureText(emoji);
  // The span is one line of `line-height: 1`: the font's ascent and descent, centred in 1em.
  const baseline = (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  const inkMiddleY = baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
  const inkMiddleX = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
  const offset = { x: (m.width / 2 - inkMiddleX) / size, y: (size / 2 - inkMiddleY) / size };
  offsets.set(emoji, offset);
  return offset;
}

/**
 * A space's icon: a lucide icon by name, or an emoji drawn as text at the icon's size (16px unless
 * sized through className), the same for both. Decorative: the space's name is always beside it or in the label.
 */
export function SpaceIcon({ icon, className }: { icon: string; className?: string }) {
  if (isEmojiIcon(icon)) {
    const { x, y } = inkOffset(icon);
    return (
      <span aria-hidden className={cn("relative inline-block size-4 shrink-0 font-emoji text-[0.875rem] leading-none select-none", className)}>
        <span
          className="absolute top-1/2 left-1/2"
          style={{ transform: `translate(calc(-50% + ${x.toFixed(3)}em), calc(-50% + ${y.toFixed(3)}em))` }}
        >
          {icon}
        </span>
      </span>
    );
  }
  return createElement(spaceIcon(icon), { "aria-hidden": true, className: cn("size-4 shrink-0", className) });
}
