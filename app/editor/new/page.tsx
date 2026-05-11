"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPresentation } from "@/app/lib/presentations";

export default function NewPresentationPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await createPresentation();
        if (!cancelled) router.replace(`/editor/${p.id}`);
      } catch (err) {
        console.error("Failed to create presentation:", err);
        if (!cancelled) router.replace("/tools/slideshow");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen text-sm text-gray-500" style={{ backgroundColor: "#F1EFE3" }}>
      Creating new slideshow…
    </div>
  );
}
