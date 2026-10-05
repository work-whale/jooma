import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";
import { getGuestRun, listGuestRuns, readGuestId } from "@/app/lib/guest";
import { guestSlugFor, appToolPath } from "@/app/lib/guest-tools";
import { encodePrefill, validatePrefill } from "@/app/lib/toolPrefill";
import { publicSettings } from "@/app/lib/settings";
import { SquircleDefs } from "@/app/components/v2/Squircle";
import CreateView from "./CreateView";

export const metadata: Metadata = {
  title: "Try Jooma free",
  description: "Make a slide deck or a comprehension from one line. Free to try, no sign up needed.",
  // A working tool page, not a page to rank. The landing page is the canonical.
  robots: { index: false, follow: true },
};

/**
 * Where the landing hero's Create button goes.
 *
 * A signed out visitor gets the tool here, in full, with Jo beside it, and can
 * generate once per tool per day without an account. Everything they make is
 * kept against their guest cookie (set by proxy.ts on this path) and moves into
 * their library when they sign up.
 *
 * A signed in teacher has no reason to be here and is sent to the real tool,
 * with the topic carried over.
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; topic?: string; run?: string }>;
}) {
  const { tool, topic = "", run } = await searchParams;
  const slug = guestSlugFor(tool);
  if (!slug) redirect("/");

  const cleanTopic = topic.trim().slice(0, 200);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const prefill = cleanTopic ? validatePrefill({ slug, fields: { topic: cleanTopic } }) : null;
    redirect(prefill ? `${appToolPath(slug)}?prefill=${encodePrefill(prefill)}` : appToolPath(slug));
  }

  const guestId = await readGuestId();
  const [recent, restored, settings] = await Promise.all([
    guestId ? listGuestRuns(guestId) : Promise.resolve([]),
    guestId && run ? getGuestRun(guestId, run) : Promise.resolve(null),
    publicSettings(supabase),
  ]);

  return (
    <div className="jooma-v2">
      <SquircleDefs />
      <CreateView
        tool={slug}
        topic={restored ? "" : cleanTopic}
        recent={recent}
        restored={
          restored && restored.tool === slug && restored.status === "done" && restored.output
            ? {
                id: restored.id,
                title: restored.title,
                output: restored.output,
                input: restored.input,
              }
            : null
        }
        googleSignin={settings.googleSignin}
      />
    </div>
  );
}
