"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToolRun } from "@/app/lib/toolRuns";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { assemblyDeckParams } from "@/app/lib/sheets/assembly";
import { createPresentation } from "@/app/lib/presentations";
import { GENERATION_STORAGE_KEY } from "@/app/components/slideshow/GenerateModal";
import { parseLanguage } from "@/app/lib/languages";
import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";

/*
 * Reads the saved assembly script (through the teacher's own access to it),
 * creates an assembly deck from it and opens the slide editor, which makes
 * the slides with speaker notes (app/lib/staff-deck-prompt.ts).
 */
export default function AssemblySlidesStart({ from }: { from: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const run = from ? await getToolRun(from) : null;
        const doc = run?.tool_slug === "assembly-planner" ? parseSheet(run.output) : null;
        if (!run || !doc || doc.tool !== "assembly") {
          setError("We could not find that assembly script. Open it from your history and try again.");
          return;
        }
        const params = assemblyDeckParams(doc, parseLanguage(run.input?.language));
        const created = await createPresentation({
          title: "Generating…",
          slides: [],
          generationParams: params as unknown as Record<string, unknown>,
        });
        sessionStorage.setItem(`${GENERATION_STORAGE_KEY}:${created.id}`, JSON.stringify(params));
        router.replace(`/editor/${created.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();
  }, [from, router]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4" data-testid="assembly-slides-error">
        <p className="text-sm text-gray-700">{error}</p>
        <Link href="/tools/assembly-planner" className="text-sm font-semibold underline">Back to Assembly Planner</Link>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-24">
      <SlideshowLoadingAnimation label="Planning your slides…" subtitle="Building them from your script" />
    </div>
  );
}
