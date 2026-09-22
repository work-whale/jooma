"use client";

import { useCallback, useEffect, useRef } from "react";

/*
 * Scroll the page while a drag is held near the top or bottom of the screen.
 *
 * WHY THIS HAS TO EXIST. On the timetable the resources sit BELOW the week, so
 * picking one up and aiming at a lesson is routinely a drag from off-screen: by
 * the time a teacher has scrolled down far enough to see the resource they want,
 * the lesson they want it on is above the fold. A drag cannot be paused to
 * scroll, because releasing the mouse drops the resource wherever it happens to
 * be, so without this the only way through is to drop it somewhere arbitrary,
 * scroll, and drag it again.
 *
 * The WINDOW is what scrolls, not <main>: AppShellV2 is explicit that nothing
 * above <main> constrains its height, so the element grows to fit and the window
 * keeps the real scrollbar. Anything here that targeted a container's scrollTop
 * would be nudging a number that is already zero.
 *
 * Speed RAMPS with depth into the band rather than being constant. A fixed speed
 * has to choose between crawling across a long page and overshooting the lesson
 * being aimed at; ramping lets the edge of the band creep and the last few pixels
 * move properly, which is what every editor that does this settles on.
 *
 * Driven by requestAnimationFrame, NOT by the dragover event. Firing on dragover
 * alone ties scroll speed to how much the mouse happens to be moving, so holding
 * perfectly still at the top of the screen, which is exactly what someone waiting
 * for a scroll does, stops it dead.
 */

/** How deep the band reaches in from each edge. Generous, so the ramp has room
 *  to be felt rather than being a cliff at the last few pixels. */
const BAND = 140;

/** Pixels per frame hard against the edge. At 60fps this is around 2,700px a
 *  second, which crosses a long timetable in about a second: fast enough to be
 *  worth using, slow enough to stop on the lesson being aimed at. */
const MAX_SPEED = 45;

/** Entering the band at all should visibly move, or the band reads as dead
 *  space and the whole thing feels like it only works at the very edge. */
const MIN_SPEED = 6;

/**
 * How fast to scroll, given where the pointer is.
 *
 * Positive scrolls down, negative scrolls up, zero means the pointer is not in
 * either band.
 *
 * The ramp is QUADRATIC, not linear. A linear ramp spends most of the band near
 * the minimum, so it feels like one slow constant speed that suddenly lurches in
 * the last few pixels, which is precisely the complaint it was meant to avoid.
 * Squaring the depth puts the useful range in the middle of the band, where the
 * pointer actually sits.
 */
export function scrollSpeedFor(y: number, viewportHeight: number, band = BAND): number {
  // Depth into the band, 0 at its inner edge and 1 hard against the screen edge.
  const speedAt = (depth: number) =>
    MIN_SPEED + (MAX_SPEED - MIN_SPEED) * depth * depth;

  if (y < band) return -speedAt((band - y) / band);

  const fromBottom = viewportHeight - y;
  if (fromBottom < band) return speedAt((band - fromBottom) / band);

  return 0;
}

/**
 * Auto-scroll while something is being dragged.
 *
 * Returns handlers to spread onto whatever wraps the draggable area. `onDragOver`
 * records the pointer; `stop` ends it, and must be called from both dragend and
 * drop, since a drag that ends in a drop fires no dragend on the source in every
 * engine.
 */
export function useDragAutoScroll() {
  /* The pointer's y, and the frame loop's handle. Refs rather than state: this
     updates on every dragover and drives an rAF loop, and re-rendering the whole
     week at that rate would make the drag itself stutter. */
  const pointerY = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    pointerY.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  /* The frame loop, held in a ref so it can schedule itself.
   *
   * A useCallback that called itself by name would be reading the binding it is
   * still in the middle of declaring, which the React compiler rejects outright.
   * A ref assigned in an effect is the way to write a self-scheduling loop that
   * also keeps a stable identity. */
  const tick = useRef<() => void>(() => {});
  useEffect(() => {
    tick.current = () => {
      const y = pointerY.current;
      if (y === null) {
        frame.current = null;
        return;
      }
      const speed = scrollSpeedFor(y, window.innerHeight);
      if (speed !== 0) window.scrollBy(0, speed);
      frame.current = requestAnimationFrame(() => tick.current());
    };
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    pointerY.current = e.clientY;
    // Start the loop on the first move, then leave it running: it reads the ref
    // each frame, so it needs no restarting as the pointer moves.
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => tick.current());
    }
  }, []);

  /* A drag abandoned outside the window, or one ended by Escape, fires no
     dragend on anything this component owns. Without these the loop would
     outlive the drag and the page would scroll on its own forever. */
  useEffect(() => {
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      // Unmounting mid-drag, which a navigation from the modal can do.
      stop();
    };
  }, [stop]);

  return { onDragOver, stop };
}
