import type { Metadata } from "next";
import { createClient } from "@/app/lib/auth/server";
import AmbassadorLanding from "@/app/components/ambassador/AmbassadorLanding";
import AlreadyApplied, { AppliedGuard } from "@/app/components/ambassador/AlreadyApplied";

// The programme's landing page, and what jooma.ai/ambassador shows. Public:
// the person may not have a Jooma account yet. Signed out, proxy.ts rewrites
// /ambassador here so the short link keeps its URL; signed in, /ambassador
// sends a teacher who has not applied here.
//
// Someone who has already applied (often arriving by the Back button) is told
// so and taken to the dashboard rather than offered the application again.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Jooma Ambassador Programme" },
  robots: { index: false, follow: false },
};

export default async function AmbassadorJoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [{ data: app }, { data: amb }] = await Promise.all([
      supabase.rpc("my_ambassador_application"),
      supabase.rpc("my_ambassador"),
    ]);
    const application = Array.isArray(app) ? app[0] : null;
    const ambassador = Array.isArray(amb) ? amb[0] : null;
    if ((application && application.status !== "declined") || ambassador?.status === "active") {
      return <AlreadyApplied />;
    }
  }

  return (
    <AppliedGuard>
      <AmbassadorLanding signedIn={Boolean(user)} />
    </AppliedGuard>
  );
}
