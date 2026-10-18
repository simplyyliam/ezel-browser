import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { cn } from "@/lib/utils";

// Spec and reasoning: docs/design/decisions.md, "Scrollbar".

/** Resting thumb length (px): a small pill, never a long bar. */
const THUMB_MIN = 20;
const THUMB_MAX = 44;
/** Keeps the thumb off the viewport's top and bottom edges (and the rounded corners around them). */
const END_INSET = 6;
/** Scroll speed (px/s) that stretches the thumb the most. */
const FULL_STRETCH_SPEED = 2400;
/** Most extra length while scrolling, as a share of the resting length. */
const MAX_STRETCH = 1;
/** How long the thumb lingers after scrolling stops. */
const HIDE_AFTER = 900;
/** Edge fade (px) shown where more content is hidden past that edge. */
const FADE = 16;
/** Slightly under-damped: when scrolling stops the thumb snaps back a hair past its resting length, like an elastic. */
const STRETCH_SPRING = { stiffness: 520, damping: 26, mass: 0.6 };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** The thumb's resting length for a viewport of `client` px showing `total` px of content. */
const restLength = (client: number, total: number) =>
  clamp(((client - END_INSET * 2) * client) / Math.max(total, 1), THUMB_MIN, THUMB_MAX);

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  /** Padding etc. for the scrolling viewport. */
  viewportClassName?: string;
}

/**
 * Native vertical scrolling (wheel, keyboard, touch all stay native) with the scrollbar replaced by
 * a small trackless pill. It appears only while scrolling, hovering the right edge or dragging, and
 * stretches with scroll speed, springing back when scrolling stops.
 */
export const ScrollArea = ({ children, className, viewportClassName }: ScrollAreaProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const scrollTop = useMotionValue(0);
  const clientHeight = useMotionValue(0);
  const scrollHeight = useMotionValue(0);
  const [overflows, setOverflows] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Read live by the stretch transform: no stretch while dragging (the thumb should feel held) or with reduced motion.
  const noStretch = useRef(false);
  useEffect(() => {
    noStretch.current = Boolean(reduceMotion) || dragging;
  }, [reduceMotion, dragging]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const measure = () => {
      clientHeight.set(viewport.clientHeight);
      scrollHeight.set(viewport.scrollHeight);
      scrollTop.set(viewport.scrollTop);
      setOverflows(viewport.scrollHeight > viewport.clientHeight + 1);
    };

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      scrollTop.set(viewport.scrollTop);
      setScrolling(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setScrolling(false), HIDE_AFTER);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(hideTimer);
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [clientHeight, scrollHeight, scrollTop]);

  // Stretch follows scroll speed through a spring, so it eases in and snaps back elastically.
  const velocity = useVelocity(scrollTop);
  const direction = useMotionValue(1);
  useMotionValueEvent(velocity, "change", (v) => {
    if (Math.abs(v) > 1) direction.set(Math.sign(v));
  });
  const stretchTarget = useTransform(velocity, (v) =>
    noStretch.current ? 0 : Math.min(Math.abs(v) / FULL_STRETCH_SPEED, 1) * MAX_STRETCH,
  );
  const stretch = useSpring(stretchTarget, STRETCH_SPRING);

  const geometry = () => {
    const client = clientHeight.get();
    const total = scrollHeight.get();
    const rest = restLength(client, total);
    const progress = clamp(scrollTop.get() / Math.max(total - client, 1), 0, 1);
    const top = END_INSET + progress * (client - END_INSET * 2 - rest);
    const extra = Math.max(stretch.get(), -0.2) * rest;
    let start: number;
    let end: number;
    if (extra < 0) {
      // The overshoot on release: squash evenly around the resting position.
      start = top - extra / 2;
      end = top + rest + extra / 2;
    } else if (direction.get() > 0) {
      // The leading edge tracks the scroll position; the trailing edge lags behind like a pulled elastic.
      start = top - extra;
      end = top + rest;
    } else {
      start = top;
      end = top + rest + extra;
    }
    start = Math.max(start, END_INSET);
    end = Math.min(end, client - END_INSET);
    return { y: start, height: Math.max(end - start, 4) };
  };
  const thumbY = useTransform(() => geometry().y);
  const thumbHeight = useTransform(() => geometry().height);

  // Fade the edge where more content is hidden; the fade grows in over the first FADE px of scroll.
  const topFade = useTransform(() => Math.min(scrollTop.get(), FADE));
  const bottomFade = useTransform(() =>
    clamp(scrollHeight.get() - clientHeight.get() - scrollTop.get(), 0, FADE),
  );
  const mask = useMotionTemplate`linear-gradient(to bottom, transparent 0, #000 ${topFade}px, #000 calc(100% - ${bottomFade}px), transparent 100%)`;

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    event.preventDefault();
    const thumb = event.currentTarget;
    thumb.setPointerCapture(event.pointerId);

    const client = viewport.clientHeight;
    const total = viewport.scrollHeight;
    const travel = client - END_INSET * 2 - restLength(client, total);
    const ratio = (total - client) / Math.max(travel, 1);
    const startY = event.clientY;
    const startScroll = viewport.scrollTop;
    setDragging(true);

    const onMove = (e: PointerEvent) => {
      viewport.scrollTop = startScroll + (e.clientY - startY) * ratio;
    };
    const onUp = () => {
      setDragging(false);
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onUp);
      thumb.removeEventListener("pointercancel", onUp);
    };
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onUp);
    thumb.addEventListener("pointercancel", onUp);
  };

  const visible = overflows && (scrolling || hovered || dragging);
  const active = hovered || dragging;

  return (
    <div className={cn("relative min-h-0", className)}>
      <motion.div
        ref={viewportRef}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className={cn("no-scrollbar h-full overflow-y-auto overscroll-contain", viewportClassName)}
      >
        <div ref={contentRef}>{children}</div>
      </motion.div>

      {overflows && (
        // The right-edge hover zone: hovering it reveals the thumb. It sits outside the viewport,
        // so wheel events over it are passed on.
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-2.5"
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onWheel={(e) => viewportRef.current?.scrollBy({ top: e.deltaY })}
        >
          <motion.div
            onPointerDown={onThumbPointerDown}
            style={{ y: thumbY, height: thumbHeight }}
            initial={false}
            animate={{ opacity: visible ? 1 : 0 }}
            // Quick to appear, slower to leave.
            transition={{ duration: visible ? 0.12 : 0.3, ease: "easeOut" }}
            className={cn(
              "absolute top-0 right-[3px] rounded-full bg-foreground/25 transition-[width,background-color] duration-150 ease-out",
              active ? "w-1.5 bg-foreground/40" : "w-1",
              !visible && "pointer-events-none",
            )}
          />
        </div>
      )}
    </div>
  );
};
