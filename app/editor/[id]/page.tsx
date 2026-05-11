"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Editor from "@/app/components/editor/Editor";
import { getPresentation, type Presentation } from "@/app/lib/presentations";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [notFound, setNotFound] = useState(false);

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
      <div className="flex items-center justify-center h-screen text-sm text-gray-500" style={{ backgroundColor: "#F1EFE3" }}>
        Loading…
      </div>
    );
  }

  return <Editor presentation={presentation} />;
}
