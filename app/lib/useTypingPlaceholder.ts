"use client";

import { useState, useEffect, useRef } from "react";

export function useTypingPlaceholder(options: string[]) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ref = useRef(options);

  useEffect(() => {
    const phrase = ref.current[phraseIndex];

    if (!deleting && displayed === phrase) {
      const t = setTimeout(() => setDeleting(true), 1800);
      return () => clearTimeout(t);
    }
    if (deleting && displayed === "") {
      const t = setTimeout(() => {
        setDeleting(false);
        setPhraseIndex((i) => (i + 1) % ref.current.length);
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setDisplayed(deleting ? displayed.slice(0, -1) : phrase.slice(0, displayed.length + 1)),
      deleting ? 30 : 70
    );
    return () => clearTimeout(t);
  }, [displayed, deleting, phraseIndex]);

  return displayed;
}
