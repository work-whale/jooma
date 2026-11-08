import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { accountAccess, type AccessRow } from "@/app/lib/account-access";
import StartTrialButton from "@/app/components/billing/StartTrialButton";
import { v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { SquircleDefs, ToolTile } from "@/app/components/v2/Squircle";
import Wordmark from "@/app/components/v2/Wordmark";
import AmbassadorCode from "./AmbassadorCode";
import styles from "./welcome.module.css";

/*
 * The first screen a new teacher sees.
 *
 * Reached once, from the end of /complete-profile, which both the email and the
 * Google signup paths pass through. Signing in goes straight to /tools, so this
 * is not a screen anyone has to dismiss twice. Nothing is persisted to mark it
 * seen: it is a one-shot redirect target, not a flag on the profile.
 *
 * It sits outside the (app) route group deliberately, so it inherits the bare
 * root layout rather than the signed-in shell, the same way every other page in
 * the signup funnel opts out. That means SquircleDefs has to be mounted here:
 * `clip-path: url(#jsq)` resolves against the current document, and without it
 * every tool tile renders as an unclipped square.
 */

export const metadata = { title: { absolute: "Welcome to Jooma" } };

/** Four tools worth opening first, one from each of four categories so the
 *  tiles read as different kinds of job rather than a row of one colour. */
const FIRST_STOPS = ["slideshow", "lesson-planner", "worksheet-generator", "quiz-generator"];

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; checkout?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // An ambassador code travels here in the URL, forwarded by /complete-profile
  // from the sessionStorage stash that /signup?code= wrote.
  //
  // READ ON THE SERVER, deliberately. The client could read sessionStorage
  // itself, but this page is server rendered: a client-only initial value gets
  // discarded during hydration and the panel renders collapsed with an empty
  // box. Passing it down as a prop means the server and the first client render
  // already agree. The client still reads the stash as a fallback for anyone
  // who arrives here without the query string.
  const { code, checkout } = await searchParams;

  const [{ data: profile }, { data: rows }, { data: referral }] = await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_account_access"),
    // A code recorded on the profile step. Service role, because
    // ambassador_referrals is admin-only, and scoped to this user's own id, so
    // it can only ever find their own (the same read loadPlanState makes).
    supabaseAdmin
      .from("ambassador_referrals")
      .select("ambassador_codes ( code )")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const claimedCode =
    (referral?.ambassador_codes as unknown as { code?: string } | null)?.code ?? null;

  const firstName = (profile?.first_name ?? "").trim();

  // Read as an error like the rest of the account state: no prompt, and the tools.
  const row = (Array.isArray(rows) ? rows[0] : rows) as AccessRow | undefined;
  const access = row ? accountAccess(row) : null;
  const onTrial = access?.state === "trial";
  // Nothing in force: /complete-profile could not start the trial, or this
  // account has already had one. An invited teacher an admin already put on a
  // plan has nothing to choose, and should not be shown a checkout.
  const needsPlan = access?.state === "locked";
  const trialEnds = access?.trialEndsAt?.toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
  });

  // A tool that has been renamed out of the catalogue is dropped rather than
  // rendered as a blank tile, matching how the rest of the app treats a miss.
  const tools = FIRST_STOPS.map((slug) => v2ToolForSlug(slug)).filter((t) => !!t);

  return (
    <main className={styles.page}>
      <SquircleDefs />
      <div className={styles.shell}>
        <span className={styles.mark}>
          <Wordmark height={28} />
        </span>

        <h1 className={styles.title}>
          {firstName ? `Welcome to Jooma, ${firstName}` : "Welcome to Jooma"}
        </h1>
        <p className={styles.lede}>
          {onTrial
            ? `Your 3 day free trial has started, with all thirty five tools and no card needed. It ends on ${trialEnds}. Pick something to make first.`
            : needsPlan
              ? "Choose a plan to use all thirty five tools. Most of them take about a minute."
              : "Everything you need for tomorrow is here, and most of it takes about a minute. Pick something to make first."}
        </p>

        {needsPlan && access?.canStartTrial && (
          <p className={styles.foot}>
            <StartTrialButton className={styles.cta} next="/welcome" />
          </p>
        )}

        {/* A code from an ambassador is a single line unless one is waiting in the
            URL or sessionStorage. It is claimed here on the trial too, since the
            referral has to be recorded before they ever reach a checkout. The
            plans show only when there is no trial running. */}
        {/* Already recorded on the profile step: say so, rather than offer a box
            that would refuse a second code. */}
        {onTrial && claimedCode ? (
          <p className={styles.foot} data-testid="welcome-code-claimed">
            Your code <strong>{claimedCode}</strong> is on your account. It comes off your first month
            when you choose a plan.
          </p>
        ) : (
          (needsPlan || onTrial) && <AmbassadorCode initialCode={code} showPlans={needsPlan} />
        )}

        {needsPlan && checkout === "cancelled" && (
          <p className={styles.foot} role="status">
            Nothing was charged. Choose a plan whenever you are ready.
          </p>
        )}

        <ul className={styles.grid}>
          {tools.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className={styles.card}>
                <ToolTile icon={tool.icon} solid={toolSolid(tool)} />
                <span className={styles.cardText}>
                  <span className={styles.cardName}>{tool.name}</span>
                  <span className={styles.cardDesc}>{tool.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <Link href="/tools" className={styles.cta}>
          {needsPlan ? "Look around first" : "Go to my tools"}
        </Link>
        <p className={styles.foot}>
          {needsPlan
            ? "You can browse every tool, and make slides, comprehensions and worksheets for free."
            : "All thirty five tools are waiting there."}
        </p>
      </div>
    </main>
  );
}
