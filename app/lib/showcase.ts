// The "Made with Jooma" row: approved, opted in resources for the landing page.
//
// Read through public_showcase(), the definer function that returns only the
// columns a card needs. Cached briefly because the landing page is the busiest
// page there is and this changes only when an admin approves something, which
// busts the tag (see app/api/admin/showcase/route.ts).
//
// Worksheets and Comprehensions carry no picture of their own, so each one's
// output is read through public_showcase_item(), the function /made/<slug>
// uses, and cut down to the top of its first page for the card. At most a
// handful of reads, inside the same short cache.
//
// Called as anon, which is who the function is granted to. Not the service
// role: it holds no execute grant on it, so the call failed and the row never
// rendered.
import "server-only";
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { showcasePreview } from "./landing/showcase-preview";
import type { ShowcaseCard } from "@/app/components/landing/v2/MadeWithJooma";

export const SHOWCASE_TAG = "public-showcase";

const load = unstable_cache(
  async (limit: number): Promise<ShowcaseCard[]> => {
    const { data, error } = await supabase.rpc("public_showcase", {
      p_limit: limit,
    });
    if (error) {
      // Before the migration is pushed the function does not exist. The row
      // simply does not render, which is the right outcome either way.
      console.warn("[showcase] could not read:", error.message);
      return [];
    }
    const cards = (data ?? []) as ShowcaseCard[];
    return Promise.all(cards.map(withPreview));
  },
  ["public-showcase-v2"],
  { tags: [SHOWCASE_TAG], revalidate: 300 },
);

/** A Worksheet or Comprehension with its preview. A failed read keeps the
 *  drawn placeholder rather than losing the card. */
async function withPreview(card: ShowcaseCard): Promise<ShowcaseCard> {
  if (card.kind === "slides") return card;
  try {
    const { data, error } = await supabase.rpc("public_showcase_item", {
      p_slug: card.slug,
    });
    if (error || !Array.isArray(data) || data.length === 0) return { ...card, preview: null };
    return { ...card, preview: showcasePreview((data[0] as { output: string | null }).output) };
  } catch {
    return { ...card, preview: null };
  }
}

/** Never throws: an empty row is a fine landing page. */
export async function publicShowcase(limit = 6): Promise<ShowcaseCard[]> {
  try {
    return await load(limit);
  } catch {
    return [];
  }
}
