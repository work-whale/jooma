import { redirect } from "next/navigation";
import AppShellSettings from "@/app/components/v2/AppShellSettings";
import { SquircleDefs } from "@/app/components/v2/Squircle";
import CreateView from "@/app/create/CreateView";
import { createClient } from "@/app/lib/auth/server";
import { getGuestRun, listGuestRuns, trialAccount } from "@/app/lib/guest";
import { guestSlugFor } from "@/app/lib/guest-tools";
import { publicSettings } from "@/app/lib/settings";

/**
 * The three tools from the landing page, for an account with nothing in force:
 * a trial that ran out, or a subscription that ended.
 *
 * The same page and the same rules as /create. Three runs a day, nothing leaves
 * the page, and what they make waits here until they choose a plan, when it moves
 * into their library. Anyone with a plan has the real tools and is sent there.
 */
export default async function FreeToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; topic?: string; run?: string }>;
}) {
  const { tool, topic = "", run } = await searchParams;
  const slug = guestSlugFor(tool) ?? "slideshow";

  const account = await trialAccount();
  if (!account) redirect("/login");
  if (!account.locked) redirect(`/tools/${slug}`);

  const supabase = await createClient();
  const [recent, restored, settings] = await Promise.all([
    listGuestRuns(account.userId),
    run ? getGuestRun(account.userId, run) : Promise.resolve(null),
    publicSettings(supabase),
  ]);

  return (
    <>
      <AppShellSettings title="Free tools" contentClassName="" />
      <div className="jooma-v2">
        <SquircleDefs />
        <CreateView
          // See app/create/page.tsx: reopening a run is a client navigation to
          // this same page, and the open deck is set only on mount.
          key={`${slug}:${restored?.id ?? ""}`}
          tool={slug}
          topic={restored ? "" : topic.trim().slice(0, 200)}
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
          account
        />
      </div>
    </>
  );
}
