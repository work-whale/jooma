"use client";

// Jo's hands on a slide deck.
//
// The editor lends Jo a small bridge onto its own state. While a turn plays,
// Jo shows its working copy of the slides without saving: it goes to each
// slide it is changing (the tray follows), rings the text box or the slide,
// and types the new words in. When the turn ends the working copy is
// committed once, so the whole turn is one undo step and one save. A slide Jo
// added then has its picture found and put in.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeckSlide } from "@/app/lib/deck-events";
import type { ArtStyleId } from "@/app/lib/slideshowThemes";
import { applySlideOp, deckSnapshot, fillSlidePicture, isSlideOp, pendingPicture, slideOpFocus, type SlideFocus } from "@/app/lib/jo/slide-ops";
import { findStockPicture } from "@/app/lib/stock-picture";
import type { JoOp, SlideOp } from "@/app/lib/jo/types";
import type { JoAdapter } from "./useJoSession";

export interface SlidesBridge {
  getSlides(): DeckSlide[];
  getActiveIndex(): number;
  artStyle(): ArtStyleId;
  /** Draw these slides, without saving or an undo step. */
  show(next: DeckSlide[]): void;
  /** Keep these slides: saved, and one undo step. */
  commit(next: DeckSlide[]): void;
  /** Make sure what is on screen now is an undo step of its own. */
  checkpoint(): void;
  goTo(index: number): void;
}

export interface SlideJoFocus extends SlideFocus {
  label: string;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const t = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** A focus as the panel's "show me" keeps it: "slideId" or "slideId#textId". */
const keyOf = (f: SlideFocus): string => (f.textId ? `${f.slideId}#${f.textId}` : f.slideId);
const parseKey = (k: string): SlideFocus => {
  const [slideId, textId] = k.split("#");
  return textId ? { slideId, textId } : { slideId };
};

const POINT_MS = 450;
const SETTLE_MS = 450;
/** The longest one slide's typing may take, however many words changed. */
const TYPE_BUDGET_MS = 1600;

export function useSlidesJo(bridge: SlidesBridge) {
  const [focus, setFocus] = useState<SlideJoFocus | null>(null);
  const [working, setWorking] = useState(false);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  });
  const workingRef = useRef<DeckSlide[] | null>(null);
  const addedRef = useRef<string[]>([]);
  const flashRef = useRef<number | null>(null);
  const picturesRef = useRef<AbortController | null>(null);

  const goToSlide = useCallback((slides: DeckSlide[], slideId: string) => {
    const i = slides.findIndex((s) => s.id === slideId);
    if (i !== -1 && i !== bridgeRef.current.getActiveIndex()) bridgeRef.current.goTo(i);
  }, []);

  /** Type the words that changed on one slide, a few letters at a time. */
  const typeSlide = useCallback(async (before: DeckSlide[], after: DeckSlide[], slideId: string, signal: AbortSignal) => {
    const at = after.findIndex((s) => s.id === slideId);
    if (at === -1) return;
    const old = new Set((before.find((s) => s.id === slideId)?.texts ?? []).map((t) => t.text));
    const target = after[at];
    const changed = target.texts.filter((t) => t.text.trim() && !old.has(t.text));
    if (!changed.length) return;
    const total = changed.reduce((n, t) => n + t.text.length, 0);
    const perChar = Math.min(18, TYPE_BUDGET_MS / Math.max(1, total));
    const typed = new Map(changed.map((t) => [t.id, ""]));
    const frame = () =>
      after.map((s, i) => (i === at ? { ...s, texts: s.texts.map((t) => (typed.has(t.id) ? { ...t, text: typed.get(t.id)! } : t)) } : s));
    bridgeRef.current.show(frame());
    for (const t of changed) {
      const steps = Math.min(24, Math.max(4, Math.ceil(t.text.length / 4)));
      for (let k = 1; k <= steps && !signal.aborted; k++) {
        typed.set(t.id, t.text.slice(0, Math.round((t.text.length * k) / steps)));
        bridgeRef.current.show(frame());
        await wait((t.text.length * perChar) / steps, signal);
      }
      typed.delete(t.id);
    }
  }, []);

  const fillPictures = useCallback(async (ids: string[]) => {
    picturesRef.current?.abort();
    const controller = new AbortController();
    picturesRef.current = controller;
    for (const id of ids) {
      const slide = bridgeRef.current.getSlides().find((s) => s.id === id);
      const query = slide && pendingPicture(slide);
      if (!query) continue;
      try {
        const picture = await findStockPicture(query, controller.signal);
        if (!picture || controller.signal.aborted) continue;
        const now = bridgeRef.current.getSlides();
        if (!now.some((s) => s.id === id)) continue;
        bridgeRef.current.commit(fillSlidePicture(now, id, picture, bridgeRef.current.artStyle()));
      } catch {
        /* the slide keeps its placeholder; the teacher can pick a picture */
      }
    }
  }, []);

  useEffect(() => () => picturesRef.current?.abort(), []);

  const adapter = useMemo<JoAdapter>(
    () => ({
      kind: "slides",
      snapshot: () => deckSnapshot(bridgeRef.current.getSlides()),
      focus: () => {
        const i = bridgeRef.current.getActiveIndex();
        return Number.isFinite(i) ? `slide ${i + 1}` : null;
      },
      isOp: (v: unknown): v is JoOp => isSlideOp(v),
      begin() {
        picturesRef.current?.abort();
        bridgeRef.current.checkpoint();
        const before = bridgeRef.current.getSlides();
        workingRef.current = before;
        addedRef.current = [];
        setWorking(true);
        return before;
      },
      async play(op, signal) {
        const working = workingRef.current;
        if (!working || !isSlideOp(op)) return null;
        const slideOp = op as SlideOp;
        const art = bridgeRef.current.artStyle();
        const applied = applySlideOp(working, slideOp, art);
        if (!applied) return null;
        const calm = reducedMotion();

        // 1. Go to the slide and point at what is about to change.
        const at = slideOpFocus(working, slideOp);
        if (at && slideOp.op !== "addSlide") {
          goToSlide(working, at.slideId);
          setFocus({ ...at, label: op.label });
          await wait(calm ? 0 : POINT_MS, signal);
        }

        // 2. Type the new words in, on the slide as it will be.
        const landed = applied.focus;
        if (!calm && !signal.aborted && landed && (slideOp.op === "rewriteSlide" || slideOp.op === "addSlide" || slideOp.op === "setSlideText")) {
          goToSlide(applied.slides, landed.slideId);
          setFocus({ ...landed, label: op.label });
          await typeSlide(working, applied.slides, landed.slideId, signal);
        }

        // 3. Land it.
        workingRef.current = applied.slides;
        bridgeRef.current.show(applied.slides);
        if (slideOp.op === "addSlide" && landed) addedRef.current.push(landed.slideId);
        if (landed) {
          goToSlide(applied.slides, landed.slideId);
          setFocus({ ...landed, label: op.label });
        } else {
          // A deleted slide: stay where it was, or on the new last slide.
          const i = Math.min(bridgeRef.current.getActiveIndex(), applied.slides.length - 1);
          bridgeRef.current.goTo(Math.max(0, i));
          setFocus(null);
        }
        await wait(calm ? 0 : SETTLE_MS, signal);
        return { focus: landed ? keyOf(landed) : null };
      },
      end() {
        const working = workingRef.current;
        workingRef.current = null;
        if (working) bridgeRef.current.commit(working);
        setFocus(null);
        setWorking(false);
        const added = addedRef.current;
        addedRef.current = [];
        if (added.length) void fillPictures(added);
      },
      restore(before) {
        if (!Array.isArray(before)) return;
        picturesRef.current?.abort();
        const slides = before as DeckSlide[];
        bridgeRef.current.commit(slides);
        bridgeRef.current.goTo(Math.min(bridgeRef.current.getActiveIndex(), slides.length - 1));
      },
      reveal(key) {
        const f = parseKey(key);
        goToSlide(bridgeRef.current.getSlides(), f.slideId);
        if (flashRef.current) window.clearTimeout(flashRef.current);
        setFocus({ ...f, label: "" });
        flashRef.current = window.setTimeout(() => setFocus(null), 1600);
      },
    }),
    [goToSlide, typeSlide, fillPictures],
  );

  return { adapter, focus, working };
}
