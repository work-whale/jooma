"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Editor from "@/app/components/editor/Editor";
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
    return (
      <div
        className="flex flex-col items-center justify-center h-screen gap-6"
        style={{ backgroundColor: "#F1EFE3" }}
      >
        {/* Three layered slide cards with a staggered pulse */}
        <div className="relative w-32 h-20">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-md bg-white shadow-md animate-pulse"
              style={{
                transform: `translate(${(i - 1) * 6}px, ${(i - 1) * 6}px) rotate(${(i - 1) * 2.5}deg)`,
                animationDelay: `${i * 180}ms`,
                animationDuration: "1.4s",
                border: "1px solid #DAD8D0",
                zIndex: 3 - i,
              }}
            />
          ))}
        </div>
        <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Loading slideshow</p>
      </div>
    );
  }

  return <Editor presentation={presentation} generationParams={genParams ?? undefined} />;
}
