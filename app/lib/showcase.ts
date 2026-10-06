// The "Made with Jooma" row: approved, opted in resources for the landing page.
//
// Read through public_showcase(), the definer function that returns only the
// columns a card needs. Cached briefly because the landing page is the busiest
// page there is and this changes only when an admin approves something, which
// busts the tag (see app/api/admin/showcase/route.ts).
//
// Called as anon, which is who the function is granted to. Not the service
// role: it holds no execute grant on it, so the call failed and the row never
// rendered.
import "server-only";
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
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
    return (data ?? []) as ShowcaseCard[];
  },
  ["public-showcase-v1"],
  { tags: [SHOWCASE_TAG], revalidate: 300 },
);

/** Never throws: an empty row is a fine landing page. */
export async function publicShowcase(limit = 6): Promise<ShowcaseCard[]> {
  try {
    return await load(limit);
  } catch {
    return [];
  }
}
