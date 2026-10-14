import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";
import { lookupAmbassadorInvite } from "@/app/lib/ambassador-invites";
import Wordmark from "@/app/components/v2/Wordmark";
import s from "@/app/components/ambassador/programme.module.css";
import ApplyFlow from "./ApplyFlow";

// The application: four steps (Personal, Social, Payout, Agreement), then the
// under-review screen. Signed in only; proxy.ts sends a signed-out visitor to
// /login?next= this page and back.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apply | Jooma Ambassador Programme",
  robots: { index: false, follow: false },
};

export default async function AmbassadorApplyPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const here = `/ambassador/apply/${encodeURIComponent(token)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  // Already applied, or already an ambassador: their status page says where
  // they stand, and a used link would refuse them anyway.
  const [{ data: existing }, { data: amb }, { data: profile }] = await Promise.all([
    supabase.rpc("my_ambassador_application"),
    supabase.rpc("my_ambassador"),
    supabase.from("profiles").select("first_name, surname, dial_code, phone").eq("id", user.id).maybeSingle(),
  ]);
  const app = Array.isArray(existing) ? existing[0] : null;
  const ambassador = Array.isArray(amb) ? amb[0] : null;
  if ((app && app.status !== "declined") || ambassador?.status === "active") redirect("/ambassador");

  const invite = await lookupAmbassadorInvite(token);
  if (!invite.ok) {
    return (
      <main className={`${s.root} ${s.page}`}>
        <div className={`${s.wrap} ${s.narrow}`} style={{ textAlign: "center", paddingTop: 80 }}>
          <h1 className={s.h1}>
            {invite.reason === "expired" ? "This link has expired." : "This link cannot be used."}
          </h1>
          <p className={s.lead}>
            Ask whoever sent it for a new one, or email ambassadors@jooma.ai.
          </p>
          <div className={s.actions} style={{ justifyContent: "center" }}>
            <Link href="/dashboard" className={`${s.btn} ${s.btnGhost}`}>
              Go to Jooma
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const mobile = [profile?.dial_code, profile?.phone].filter(Boolean).join(" ");

  return (
    <main className={`${s.root} ${s.page}`}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "28px 22px 0", color: "var(--j-purple)" }}>
        <Link href="/dashboard" aria-label="Jooma" style={{ display: "inline-block" }}>
          <Wordmark height={22} />
        </Link>
      </div>
      <ApplyFlow
        token={token}
        defaults={{
          first_name: profile?.first_name ?? "",
          last_name: profile?.surname ?? "",
          email: user.email ?? "",
          mobile,
        }}
      />
    </main>
  );
}
