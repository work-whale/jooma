import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Crown } from "@phosphor-icons/react/dist/ssr";
import AppShellSettings from "@/app/components/v2/AppShellSettings";
import { gbp } from "@/app/lib/ambassador-commission";
import s from "@/app/components/ambassador/programme.module.css";
import { loadAmbassadorContext } from "./data";
import CodeActions from "./CodeActions";
import TabsNav from "./TabsNav";

// The ambassador's room, as mockup screens 7 to 11: a gold band with their code,
// and five tabs under it. Persistent across the tabs, so moving between them
// re-renders only the tab (docs/instant-navigation-guide.md, section 3).
//
// Someone who is not an ambassador yet gets no band: the page under it shows
// their application's status instead, or sends them to Today.
export default async function AmbassadorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await loadAmbassadorContext();
  if (!ctx.user) redirect("/login?next=/ambassador");

  const settings = (
    <AppShellSettings title="Ambassador Programme" contentClassName="px-4 sm:px-6 lg:px-10 pb-16" />
  );

  if (!ctx.ambassador) {
    return (
      <>
        {settings}
        <div className={s.root}>{children}</div>
      </>
    );
  }

  const a = ctx.ambassador;
  const code = a.codes[0] ?? null;

  // The share link opens /signup with the code, which stashes it for /welcome
  // (app/signup/page.tsx).
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "www.jooma.ai"}`;

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(new Date()),
  );
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const subscribers = Number(a.active_subscribers);
  // Ended for inactivity (agreement clause 6): the crown and verified badge come
  // off, the code no longer works, but the dashboard and statements stay.
  const ended = a.status === "ended";

  return (
    <>
      {settings}
      <div className={`${s.root} max-w-5xl`} data-testid="ambassador-dashboard">
        <div className={s.goldBand}>
          <div className={s.gbIn}>
            <div className={s.gbTop}>
              {a.status === "active" ? (
                <span className={s.verif}>
                  <Crown size={15} weight="fill" /> Verified Jooma Ambassador
                </span>
              ) : ended ? (
                <span className={s.endedPill} data-testid="ambassador-ended-pill">
                  Ambassador agreement ended
                </span>
              ) : null}
            </div>
            <div className={s.gbH}>
              <div>
                <h1>
                  {greeting}, {ctx.firstName ?? "there"}.
                </h1>
                <p>
                  {subscribers === 1
                    ? "One teacher is on Jooma because of you."
                    : `${subscribers.toLocaleString("en-GB")} teachers are on Jooma because of you.`}
                </p>
              </div>
              <div className={s.since}>
                <b>{gbp(Number(a.this_month_pence))}</b>earned this month so far
              </div>
            </div>
            {code && !ended && (
              <div className={s.codebox}>
                <div>
                  <p className={s.codeLabel}>Your code</p>
                  <p className={s.codeValue} data-testid="ambassador-code">
                    {code}
                  </p>
                </div>
                <CodeActions code={code} link={`${origin}/signup?code=${encodeURIComponent(code)}`} />
              </div>
            )}
          </div>
        </div>
        <div className={s.under}>
          <TabsNav />
          {children}
        </div>
      </div>
    </>
  );
}
