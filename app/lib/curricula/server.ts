import "server-only";

import { createClient } from "@/app/lib/auth/server";
import { parseCurriculum } from "./index";

/**
 * The curriculum a generation is written for: the one the request named
 * (already parsed, or a raw value), else the signed-in teacher's profile
 * curriculum. Tools with no Curriculum field (letters, newsletters, reports,
 * Jo's chat) rely on the second half.
 *
 * Never throws. Null means "no override", which is what every UK teacher and
 * every failure gets: a lookup that cannot run leaves the prompt as it was.
 */
export async function resolveCurriculum(requested: unknown): Promise<string | null> {
  const named = parseCurriculum(requested);
  if (named) return named;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from("profiles").select("curriculum_id").eq("id", user.id).maybeSingle();
    if (error) return null;
    return parseCurriculum((data as { curriculum_id?: unknown } | null)?.curriculum_id);
  } catch {
    return null;
  }
}
