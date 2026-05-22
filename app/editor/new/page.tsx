"use client";

// Fallback route. The canonical "New Slideshow" entry point is the inline
// create-and-push button on /tools/slideshow — it never navigates here. This
// page only ever runs if a stale browser bundle still has the old Link, or if
// someone hits /editor/new directly. In either case we silently create the
// row and redirect; we render a blank background-coloured div so there's no
// skeleton flash between the click and the editor's loading.tsx.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPresentation } from "@/app/lib/presentations";
import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";

export default function NewPresentationPage() {
  const router = useRouter();
  // React 18+ Strict Mode runs effects twice in dev to catch bugs. The
  // cleanup-flag pattern only stops the redirect — the createPresentation()
  // network call has already gone out by then, leaving a duplicate row.
  // A ref that lives across renders makes the effect actually idempotent.
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    (async () => {
      try {
        const p = await createPresentation();
        router.replace(`/editor/${p.id}`);
      } catch (err) {
        console.error("Failed to create presentation:", err);
        router.replace("/tools/slideshow");
      }
    })();
  }, [router]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "#F1EFE3" }}>
      <SlideshowLoadingAnimation label="Creating slideshow" />
    </div>
  );
}
