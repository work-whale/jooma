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
import { AGREEMENT_MONTHS, AMBASSADOR_RATES, gbp } from "@/app/lib/ambassador-commission";
import { PLANS } from "@/app/lib/plans";
import WorkedExample from "./WorkedExample";
import s from "./programme.module.css";

/** Where applying happens. Signed in only; proxy.ts sends anyone else to log in
 *  and back, and /login and /signup honour ?next= for /ambassador paths. */
export const APPLY = "/ambassador/apply";

const PLAN_SWATCH: Record<"standard" | "pro" | "max", string> = {
  standard: "#0F8A63",
  pro: "var(--j-purple)",
  max: "#C08A1E",
};

/**
 * The programme's landing page: what an ambassador gets, what they earn, and
 * the way in. Shown at the one short link the programme is shared by,
 * jooma.ai/ambassador (app/ambassador/join), to anyone who has not applied.
 *
 * Signed in, the call to action goes straight to the application. Signed out,
 * it goes to signup first, carried through to the application by ?next=.
 */
export default function AmbassadorLanding({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? APPLY : `/signup?next=${encodeURIComponent(APPLY)}`;
  const proPrice = PLANS.pro.priceMonthly ?? 0;

  return (
    <main className={`${s.root} ${s.page}`} data-testid="ambassador-landing">
      <div className={s.band}>
        <div className={s.bandIn}>
          <span className={s.invited}>
            <span className={s.invitedAv}>
              <Crown size={15} weight="fill" aria-hidden />
            </span>
            <span>
              You&apos;re invited by <b>Jooma</b>
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
            Takes about five minutes. Nothing is charged, ever.
            {!signedIn && (
              <>
                {" "}
                Already on Jooma?{" "}
                <Link href={`/login?next=${encodeURIComponent(APPLY)}`} className={s.bandLink}>
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
              Three steps, then you are live.
            </h2>
          </div>
          <div className={s.card} style={{ boxShadow: "none" }}>
            <Step colour="var(--j-purple)" icon={<IdentificationCard size={17} weight="fill" />} title="Tell us where you post" body="The accounts you would share your code from. Your name and contact details come from your Jooma account." />
            <Step colour="#1D6FD0" icon={<Bank size={17} weight="fill" />} title="Tell us where to pay you, and pick your code" body="A UK bank account or PayPal in your own name, a few details for the agreement, and the code teachers will type." />
            <Step colour="#0E7490" icon={<Signature size={17} weight="fill" />} title="Read and sign the agreement" body="Twelve months, plain English, no exclusivity." />
            <Step colour="#C08A1E" icon={<SealCheck size={17} weight="fill" />} title="We check it and switch you on" body="Usually within two working days, and you can use Jooma Standard free while we do. Your code and dashboard appear the moment we approve you." />
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
