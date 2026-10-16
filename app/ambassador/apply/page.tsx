import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";
import { profileMobile } from "@/app/lib/dial-codes";
import { isMobile } from "@/app/lib/ambassador-application";
import Wordmark from "@/app/components/v2/Wordmark";
import AlreadyApplied from "@/app/components/ambassador/AlreadyApplied";
import s from "@/app/components/ambassador/programme.module.css";
import ApplyFlow from "./ApplyFlow";

// The application: three steps (Social, Payout, Agreement), then the
// under-review screen. Signed in only; proxy.ts sends a signed-out visitor to
// /login?next= this page and back.
//
// Name, email and mobile come from their Jooma account (signup asked for
// them), so there is no Personal step. Open to anyone signed in: the
// programme has one link, and an admin approves every application.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apply | Jooma Ambassador Programme",
  robots: { index: false, follow: false },
};

export default async function AmbassadorApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/ambassador/apply")}`);

  const [{ data: existing }, { data: amb }, { data: profile }] = await Promise.all([
    supabase.rpc("my_ambassador_application"),
    supabase.rpc("my_ambassador"),
    supabase.from("profiles").select("first_name, surname, dial_code, phone").eq("id", user.id).maybeSingle(),
  ]);
  const app = Array.isArray(existing) ? existing[0] : null;
  const ambassador = Array.isArray(amb) ? amb[0] : null;

  // Already applied, or already an ambassador. Usually someone who pressed
  // Back after signing: say so and take them to the dashboard, rather than
  // showing an empty form they cannot send again.
  const applied = (app && app.status !== "declined") || ambassador?.status === "active";

  const mobile = profileMobile(profile?.dial_code, profile?.phone);

  return (
    <main className={`${s.root} ${s.page}`}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "28px 22px 0", color: "var(--j-purple)" }}>
        <Link href="/dashboard" aria-label="Jooma" style={{ display: "inline-block" }}>
          <Wordmark height={22} />
        </Link>
      </div>
      {applied ? (
        <AlreadyApplied />
      ) : (
        <ApplyFlow
          account={{
            first_name: profile?.first_name ?? "",
            last_name: profile?.surname ?? "",
            email: user.email ?? "",
            mobile: isMobile(mobile) ? mobile : "",
          }}
        />
      )}
    </main>
  );
}
