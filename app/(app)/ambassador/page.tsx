import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Crown } from "@phosphor-icons/react/dist/ssr";
import AppShellSettings from "@/app/components/v2/AppShellSettings";
import AmbassadorWordmark from "@/app/components/v2/AmbassadorWordmark";
import { createClient } from "@/app/lib/auth/server";
import { asPlanId } from "@/app/lib/plans";
import { planCardName } from "@/app/lib/plan-copy";
import { daysUntil, AMBASSADOR_ENDING_DAYS } from "@/app/lib/plan-badge";
import CopyField from "./CopyField";

// The ambassador's own room: their code, the link to share, and the teachers
// who joined with it.
//
// Everything comes through two definer functions scoped to the caller,
// my_ambassador() and my_ambassador_referrals(). The ambassador tables are
// admin-only, and these return named columns and nothing more: a referred
// teacher appears as a first name and a surname initial, never an email,
// school or id. See supabase/migrations/20261012000000_ambassador_pro.sql.
//
// Anyone who is not an ambassador is sent to Today. The sidebar only links
// here for ambassadors, so that is a typed URL, not a dead end in the nav.
export const dynamic = "force-dynamic";

interface MyAmbassador {
  full_name: string;
  status: string;
  pro_until: string | null;
  codes: string[];
  referrals: number;
  subscribers: number;
  owed: number;
  paid: number;
}

interface MyReferral {
  display_name: string;
  redeemed_at: string;
  subscribed: boolean;
  first_paid_plan: string | null;
  payout_status: string;
}

function longDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function AmbassadorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ambassador");

  const [{ data: me }, { data: referralRows }, { data: profile }] = await Promise.all([
    supabase.rpc("my_ambassador"),
    supabase.rpc("my_ambassador_referrals"),
    supabase.from("profiles").select("first_name, plan").eq("id", user.id).maybeSingle(),
  ]);

  const ambassador = (Array.isArray(me) ? me[0] : null) as MyAmbassador | null | undefined;
  if (!ambassador) redirect("/dashboard");

  const referrals = (referralRows ?? []) as MyReferral[];
  const firstName = profile?.first_name?.trim() || ambassador.full_name.split(" ")[0];

  const now = new Date();
  const proUntil = ambassador.pro_until ? new Date(ambassador.pro_until) : null;
  const proLive = proUntil !== null && proUntil.getTime() > now.getTime();
  const daysLeft = proLive ? daysUntil(proUntil, now) : null;
  const paused = ambassador.status !== "active";

  // The share link points at /signup, which stashes ?code= and offers it again
  // on /welcome once the account exists (app/signup/page.tsx).
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "www.jooma.ai"}`;

  const stats = [
    { label: "Teachers joined", value: Number(ambassador.referrals) },
    { label: "Subscribed", value: Number(ambassador.subscribers) },
    { label: "Payouts owed", value: Number(ambassador.owed) },
    { label: "Payouts paid", value: Number(ambassador.paid) },
  ];

  return (
    <>
      <AppShellSettings title="Ambassador" contentClassName="px-4 sm:px-6 lg:px-10 pb-16" />

      <div className="max-w-4xl space-y-6">
        {/* ── Hero ── */}
        <section
          className="rounded-3xl border p-6 sm:p-8"
          style={{
            background:
              "linear-gradient(135deg, var(--j-gold-bg) 0%, var(--j-card) 70%)",
            borderColor: "color-mix(in srgb, var(--j-gold) 30%, transparent)",
          }}
        >
          <div style={{ color: "var(--j-purple)" }}>
            <AmbassadorWordmark height={52} />
          </div>
          <h1
            className="mt-6 text-2xl sm:text-3xl font-extrabold"
            style={{ color: "var(--j-ink)" }}
          >
            Thanks for representing Jooma, {firstName}.
          </h1>
          <p className="mt-2 text-sm sm:text-base max-w-xl" style={{ color: "var(--j-body)" }}>
            Every teacher who signs up with your code is counted here, and you are
            paid for each one who subscribes.
          </p>

          <div
            className="mt-5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-3"
            style={{ backgroundColor: "var(--j-card)", border: "1px solid var(--j-line)" }}
            data-testid="ambassador-pro-status"
          >
            <Crown weight="fill" className="w-5 h-5 shrink-0" style={{ color: "var(--j-gold)" }} />
            <span className="text-sm" style={{ color: "var(--j-body)" }}>
              {proLive && daysLeft !== null && daysLeft <= AMBASSADOR_ENDING_DAYS ? (
                <>
                  Your free Pro ends in <b>{daysLeft} {daysLeft === 1 ? "day" : "days"}</b>.{" "}
                  <Link href="/pricing" className="font-semibold underline" style={{ color: "var(--j-purple)" }}>
                    Keep Pro
                  </Link>
                </>
              ) : proLive ? (
                <>
                  <b>Ambassador Pro</b>, free until {longDate(proUntil)}.
                </>
              ) : proUntil ? (
                <>
                  Your free year of Pro ended on {longDate(proUntil)}. You&apos;re on{" "}
                  {planCardName(asPlanId(profile?.plan))} now.{" "}
                  <Link href="/pricing" className="font-semibold underline" style={{ color: "var(--j-purple)" }}>
                    See plans
                  </Link>
                </>
              ) : (
                <>Your free Pro is being set up. It will show here once it&apos;s active.</>
              )}
            </span>
          </div>

          {paused && (
            <p className="mt-4 text-sm" style={{ color: "var(--j-muted)" }}>
              Your code is paused at the moment, so new teachers can&apos;t use it. Everyone
              who already joined still counts.
            </p>
          )}
        </section>

        {/* ── Code and link ── */}
        {ambassador.codes.length > 0 && (
          <section
            className="rounded-2xl border p-5 sm:p-6"
            style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
          >
            <h2 className="text-base font-bold mb-4" style={{ color: "var(--j-ink)" }}>
              Share your code
            </h2>
            <div className="space-y-5">
              {ambassador.codes.map((code) => (
                <div key={code} className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                  <CopyField label="Your code" value={code} mono />
                  <CopyField
                    label="Sign up link"
                    value={`${origin}/signup?code=${encodeURIComponent(code)}`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--j-muted)" }}>
              Teachers can also type the code on their Plans page after signing up.
            </p>
          </section>
        )}

        {/* ── Numbers ── */}
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4" aria-label="Your numbers">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border p-4"
              style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
            >
              <p className="text-xs font-semibold" style={{ color: "var(--j-muted)" }}>
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: "var(--j-ink)" }}>
                {s.value.toLocaleString("en-GB")}
              </p>
            </div>
          ))}
        </section>

        {/* ── The teachers under their name ── */}
        <section
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
        >
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: "var(--j-line)" }}>
            <h2 className="text-base font-bold" style={{ color: "var(--j-ink)" }}>
              Teachers who joined with your code
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--j-muted)" }}>
              First name and initial only, to keep their details private.
            </p>
          </div>

          {referrals.length === 0 ? (
            <p className="px-5 sm:px-6 py-8 text-sm text-center" style={{ color: "var(--j-muted)" }}>
              Nobody yet. Share your link and they&apos;ll appear here as soon as they sign up.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="ambassador-referrals">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--j-muted)" }}>
                    <th className="px-5 sm:px-6 py-2.5 font-semibold">Teacher</th>
                    <th className="px-3 py-2.5 font-semibold">Joined</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-5 sm:px-6 py-2.5 font-semibold text-right">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--j-line)" }}>
                      <td className="px-5 sm:px-6 py-3 font-semibold" style={{ color: "var(--j-ink)" }}>
                        {r.display_name}
                      </td>
                      <td className="px-3 py-3 tabular-nums" style={{ color: "var(--j-body)" }}>
                        {shortDate(r.redeemed_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="text-xs font-bold rounded-full px-2.5 py-1"
                          style={
                            r.subscribed
                              ? { backgroundColor: "var(--j-tint-green)", color: "#1f6b3b" }
                              : { backgroundColor: "var(--j-tint)", color: "var(--j-muted)" }
                          }
                        >
                          {r.subscribed
                            ? `Subscribed${r.first_paid_plan ? ` · ${planCardName(asPlanId(r.first_paid_plan))}` : ""}`
                            : "Signed up"}
                        </span>
                      </td>
                      <td className="px-5 sm:px-6 py-3 text-right text-xs font-semibold" style={{ color: "var(--j-body)" }}>
                        {r.payout_status === "paid"
                          ? "Paid"
                          : r.payout_status === "unpaid"
                            ? "Owed"
                            : "Not yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
