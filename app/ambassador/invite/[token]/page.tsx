import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bank,
  ChartLineUp,
  Crown,
  CurrencyGbp,
  IdentificationCard,
  SealCheck,
  Signature,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/app/lib/auth/server";
import { lookupAmbassadorInvite } from "@/app/lib/ambassador-invites";
import { AGREEMENT_MONTHS, AMBASSADOR_RATES, gbp } from "@/app/lib/ambassador-commission";
import { PLANS } from "@/app/lib/plans";
import Wordmark from "@/app/components/v2/Wordmark";
import WorkedExample from "@/app/components/ambassador/WorkedExample";
import s from "@/app/components/ambassador/programme.module.css";

// The page an invite link opens. Public: the person may not have a Jooma
// account yet, and signs in from here (proxy.ts lists /ambassador/invite).
//
// The token is looked up by its hash with the service role, the same way
// teacher invites are (app/lib/invites.ts). All this ever reveals is the first
// name the admin typed on older links, to the person holding the link it was
// made for. Newer links have no name and greet nobody in particular.
// Opening it is recorded once, for the admin's "invites unopened" figure.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jooma Ambassador Programme",
  robots: { index: false, follow: false },
};

const PLAN_SWATCH: Record<"standard" | "pro" | "max", string> = {
  standard: "#0F8A63",
  pro: "var(--j-purple)",
  max: "#C08A1E",
};

export default async function AmbassadorInvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await lookupAmbassadorInvite(token, { markOpened: true });

  if (!invite.ok) {
    const copy = {
      invalid: ["This link does not work.", "It may have been mistyped or withdrawn. Ask whoever sent it for a new one."],
      expired: ["This link has expired.", "Invite links work for 14 days. Ask us for a fresh one and you can carry on."],
      used: ["This link has already been used.", "Each link is for one application. If that was you, your application is with us."],
    }[invite.reason];
    return (
      <main className={`${s.root} ${s.page}`}>
        <div className={`${s.wrap} ${s.narrow}`} style={{ textAlign: "center", paddingTop: 80 }}>
          <div style={{ color: "var(--j-purple)", display: "inline-block", marginBottom: 28 }}>
            <Wordmark height={28} />
          </div>
          <h1 className={s.h1}>{copy[0]}</h1>
          <p className={s.lead}>{copy[1]}</p>
          <div className={s.actions} style={{ justifyContent: "center" }}>
            <Link href={invite.reason === "used" ? "/ambassador" : "/"} className={`${s.btn} ${s.btnGhost}`}>
              {invite.reason === "used" ? "See my application" : "Go to Jooma"}
            </Link>
          </div>
          <p className={s.lead} style={{ fontSize: ".86rem" }}>
            Questions? Email{" "}
            <a href="mailto:ambassadors@jooma.ai" style={{ color: "var(--j-purple)", fontWeight: 700 }}>
              ambassadors@jooma.ai
            </a>
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const apply = `/ambassador/apply/${encodeURIComponent(token)}`;
  // Signed in: straight to the application. Signed out: sign up (or in) first,
  // then on to the application, carried through by ?next=.
  const cta = user ? apply : `/signup?next=${encodeURIComponent(apply)}`;
  // Links made since October 2026 carry no name: the admin makes one with a
  // click and sends it on. Older ones still greet the person by first name.
  const firstName = invite.name ? invite.name.split(/\s+/)[0] : null;
  const initials = invite.name
    ? invite.name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;
  const proPrice = PLANS.pro.priceMonthly ?? 0;

  return (
    <main className={`${s.root} ${s.page}`} data-testid="ambassador-invite">
      <div className={s.band}>
        <div className={s.bandIn}>
          <span className={s.invited}>
            <span className={s.invitedAv}>
              {initials ?? <Crown size={15} weight="fill" aria-hidden />}
            </span>
            <span>
              {firstName ? (
                <>
                  <b>{firstName}</b>, you&apos;re invited by <b>Jooma</b>
                </>
              ) : (
                <>
                  You&apos;re invited by <b>Jooma</b>
                </>
              )}
            </span>
          </span>
          <span className={s.goldTag}>
            <Crown size={15} weight="fill" /> Jooma Ambassador Programme
          </span>
          <h1 className={s.bandTitle}>
            Teach with Jooma.
            <br />
            <span className={s.goldText}>Earn with Jooma.</span>
          </h1>
          <p className={s.bandSub}>
            A small, invitation-only programme for UK teachers who already share what works. Twelve
            months of Pro, a code of your own, and a share of every teacher you bring.
          </p>
          <div className={s.bandActs}>
            <Link href={cta} className={`${s.btn} ${s.btnGold} ${s.btnLg}`} data-testid="invite-cta">
              Create my Ambassador account <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
          <p className={s.bandNote}>
            Takes about six minutes. Nothing is charged, ever.
            {!user && (
              <>
                {" "}
                Already on Jooma?{" "}
                <Link href={`/login?next=${encodeURIComponent(apply)}`} className={s.bandLink}>
                  Log in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={s.wrap}>
        <section className={s.sec}>
          <div className={s.secHead}>
            <span className={s.eye}>What you get</span>
            <h2 className={s.h1} style={{ fontSize: "1.9rem" }}>
              Three things, and all of them are yours from day one.
            </h2>
          </div>
          <div className={s.perks}>
            <div className={s.perk}>
              <span className={s.perkIcon} style={{ background: "linear-gradient(140deg,#E8B944,#C08A1E)" }}>
                <Crown size={21} weight="fill" />
              </span>
              <h3>Twelve months of Pro, free</h3>
              <p>
                The full £{proPrice.toFixed(2)} plan, on us, for the length of your agreement. Every
                tool, and clean exports.
              </p>
            </div>
            <div className={s.perk}>
              <span className={s.perkIcon} style={{ background: "linear-gradient(140deg,#8B6AE8,#5B2ED6)" }}>
                <ChartLineUp size={21} weight="fill" />
              </span>
              <h3>Your own dashboard</h3>
              <p>
                Every sign-up, every pound, every payout. The same numbers we see. No asking us for a
                figure, ever.
              </p>
            </div>
            <div className={s.perk}>
              <span className={s.perkIcon} style={{ background: "linear-gradient(140deg,#2FAE86,#0F8A63)" }}>
                <CurrencyGbp size={21} weight="fill" />
              </span>
              <h3>Paid every month</h3>
              <p>
                To your bank or PayPal, on the 15th, for the month before. A statement for each
                payment, downloadable whenever you want it.
              </p>
            </div>
          </div>
        </section>

        <section className={s.sec}>
          <div className={s.secHead}>
            <span className={s.eye}>The numbers</span>
            <h2 className={s.h1} style={{ fontSize: "1.9rem" }}>
              What you earn, written down.
            </h2>
            <p>No tiers to climb, no targets to hit. The rate is the rate from your first sign-up.</p>
          </div>
          <div className={s.scrollX}>
            <table className={s.rates}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>If they pay monthly</th>
                  <th>If they pay yearly</th>
                </tr>
              </thead>
              <tbody>
                {(["standard", "pro", "max"] as const).map((p) => (
                  <tr key={p}>
                    <td>
                      <span className={s.planSw}>
                        <i style={{ backgroundColor: PLAN_SWATCH[p] }} />
                        {PLANS[p].name}
                      </span>
                    </td>
                    <td>
                      <b>{gbp(AMBASSADOR_RATES.month[p])}</b> a month, every month they pay
                    </td>
                    <td>
                      <b>{gbp(AMBASSADOR_RATES.year[p])}</b> once
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.lead} style={{ fontSize: ".85rem", textAlign: "center" }}>
            Earned on payments made during your {AGREEMENT_MONTHS}-month agreement. Teachers who use
            your code also get money off their first payment.
          </p>
          <WorkedExample />
        </section>

        <section className={s.sec}>
          <div className={s.secHead}>
            <span className={s.eye}>How it works</span>
            <h2 className={s.h1} style={{ fontSize: "1.9rem" }}>
              Four steps, then you are live.
            </h2>
          </div>
          <div className={s.card} style={{ boxShadow: "none" }}>
            <Step colour="var(--j-purple)" icon={<IdentificationCard size={17} weight="fill" />} title="Tell us who you are" body="Name, contact, and the accounts you post from." />
            <Step colour="#1D6FD0" icon={<Bank size={17} weight="fill" />} title="Tell us where to pay you, and pick your code" body="A UK bank account or PayPal in your own name, and the code teachers will type." />
            <Step colour="#0E7490" icon={<Signature size={17} weight="fill" />} title="Read and sign the agreement" body="Twelve months, plain English, no exclusivity." />
            <Step colour="#C08A1E" icon={<SealCheck size={17} weight="fill" />} title="We check it and switch you on" body="Usually within two working days. Your code and dashboard appear the moment we do." />
          </div>
          <div style={{ textAlign: "center", marginTop: 34 }}>
            <Link href={cta} className={`${s.btn} ${s.btnGold} ${s.btnLg}`}>
              Create my Ambassador account <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function Step({
  colour,
  icon,
  title,
  body,
}: {
  colour: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className={s.rowline}>
      <span className={s.rowIcon} style={{ background: colour }}>
        {icon}
      </span>
      <span className={s.rowMain}>
        <b>{title}</b>
        <span>{body}</span>
      </span>
    </div>
  );
}
