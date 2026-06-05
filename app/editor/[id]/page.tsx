"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Editor from "@/app/components/editor/Editor";
import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";
import { getPresentation, type Presentation } from "@/app/lib/presentations";
import { GENERATION_STORAGE_KEY, type GenerationParams } from "@/app/components/slideshow/GenerateModal";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [notFound, setNotFound] = useState(false);
  // If we navigated in from the AI-generate modal, pick up the params and pop them
  // out of sessionStorage immediately so a refresh doesn't re-run the generation.
  const [genParams, setGenParams] = useState<GenerationParams | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${GENERATION_STORAGE_KEY}:${id}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      try {
        setGenParams(JSON.parse(stored));
      } catch {}
      sessionStorage.removeItem(key);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getPresentation(id)
      .then((p) => {
        if (cancelled) return;
        if (!p) setNotFound(true);
        else setPresentation(p);
      })
      .catch((err) => {
        console.error("Failed to load presentation:", err);
        if (!cancelled) setNotFound(true);
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (notFound) {
      const t = setTimeout(() => router.replace("/tools/slideshow"), 1500);
      return () => clearTimeout(t);
    }
  }, [notFound, router]);

  if (notFound) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-gray-500" style={{ backgroundColor: "#F1EFE3" }}>
        Presentation not found — redirecting…
      </div>
    );
  }

  if (!presentation) {
    // Match the Editor's pre-generation overlay when we arrived here to generate,
    // so the loader transitions seamlessly (no label/layout change) into it.
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: "#F1EFE3" }}>
        <SlideshowLoadingAnimation
          label={genParams ? "Planning your deck…" : "Loading slideshow"}
          subtitle={genParams ? "This usually takes about 15 seconds" : undefined}
        />
      </div>
    );
  }

  return <Editor presentation={presentation} generationParams={genParams ?? undefined} />;
}
