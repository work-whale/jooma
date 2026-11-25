import type { Metadata } from "next";
import Link from "next/link";
import {
  Buildings,
  CaretDown,
  CheckSquare,
  Clock,
  Coins,
  CreditCard,
  EnvelopeSimple,
  Receipt,
  ShieldCheck,
  Sparkle,
  XSquare,
} from "@phosphor-icons/react/dist/ssr";
import Wordmark from "@/app/components/v2/Wordmark";
import { OFFER, TRIAL } from "@/app/lib/plan-config";
import { REFUND_WINDOWS, daysInWords } from "@/app/lib/refund-policy";
import { CONTACT_EMAIL } from "@/app/lib/seo/brand";
import RefundsRail from "./RefundsRail";
import s from "./refunds.module.css";

/*
 * The refund policy, as the owner wrote it (docs/18-jooma-refund-policy.html).
 *
 * Every number of days, the trial length and the half price first month are
 * read from code (REFUND_WINDOWS here, the same constant the admin refund
 * console checks against, plus TRIAL and OFFER), so this page and the rules
 * cannot drift apart. tests/unit/refunds-page.spec.ts refuses a number typed in
 * by hand.
 *
 * Words changed from the markup, on purpose: the contact address is the shared
 * CONTACT_EMAIL, the trial length is read from TRIAL rather than described
 * loosely, and the paragraph about buying through a phone store is gone because
 * nothing is sold that way.
 */

export const metadata: Metadata = {
  title: "Refunds and cancellations",
  description: "When Jooma gives your money back, how to ask, and how long it takes.",
  alternates: { canonical: "/refunds" },
};

const LAST_UPDATED = "26 November 2026";

/* The right to change your mind in the Consumer Contracts Regulations is
 * set by law, not by us. It happens to match our window today, but it is a
 * separate fact and must not move if the window does. */
const STATUTORY_DAYS = 14;

const W = REFUND_WINDOWS;
const MAIL = `mailto:${CONTACT_EMAIL}?subject=Refund%20request`;

const RAIL = [
  { id: "c1", label: "1 · Your legal rights" },
  { id: "c2", label: `2 · The ${TRIAL.days} day trial` },
  { id: "c3", label: "3 · Monthly plans" },
  { id: "c4", label: "4 · Yearly plans" },
  { id: "c5", label: "5 · Top ups" },
  { id: "c6", label: "6 · Unwanted renewals" },
  { id: "c7", label: "7 · When it is our fault" },
  { id: "c8", label: "8 · Schools and trusts" },
  { id: "c9", label: "9 · What we do not refund" },
  { id: "ask", label: "How to ask" },
];

export default function RefundsPage() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <div className={s.topIn}>
          <Link className={s.logo} href="/" aria-label="Jooma home">
            <svg className={s.mark} viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <clipPath id="refunds-sq" clipPathUnits="objectBoundingBox">
                  <path d="M0,0.5 C0,0.115 0.115,0 0.5,0 C0.885,0 1,0.115 1,0.5 C1,0.885 0.885,1 0.5,1 C0.115,1 0,0.885 0,0.5 Z" />
                </clipPath>
              </defs>
              <g clipPath="url(#refunds-sq)">
                <rect width="100" height="100" fill="#5B2ED6" />
                <path
                  d="M62 24v34c0 11-8 18-19 18-9 0-16-5-18-13l11-4c1 4 4 6 7 6 4 0 6-3 6-7V33H41V24z"
                  fill="#fff"
                />
              </g>
            </svg>
            <Wordmark height={17} />
          </Link>
          <Link className={s.back} href="/">
            <CaretDown weight="fill" aria-hidden="true" /> Back to Jooma
          </Link>
        </div>
      </header>

      <section className={s.mast}>
        <span className={s.kind}>
          <Receipt weight="fill" aria-hidden="true" /> Refunds and cancellations
        </span>
        <h1>If Jooma is not right for you, we give your money back.</h1>
        <p className={s.lede}>
          This page says exactly when, without the hedging. We would rather hand back a subscription than have you feel
          stuck with one, and we would rather you told us why than quietly resented us.
        </p>
        <ul className={s.meta}>
          <li>
            <b>Applies to</b> individual teacher subscriptions
          </li>
          <li>
            <b>Last updated</b> {LAST_UPDATED}
          </li>
          <li>
            <b>Schools and trusts</b> see clause 8
          </li>
        </ul>
      </section>

      <section className={s.tldr}>
        <div className={s.tldrIn}>
          <h2>The short version</h2>
          <p className={s.sub}>Five rules cover almost every situation. The clauses below only add detail.</p>
          <ul className={s.rules}>
            <li className={s.rule}>
              <span className={s.ic}>
                <Clock weight="fill" aria-hidden="true" />
              </span>
              <div>
                <b>{daysInWords(W.coolingOffDays)} days on any payment, no reason needed</b>
                <span>
                  Monthly or yearly. Write to us within {W.coolingOffDays} days of a charge and we refund it.
                </span>
              </div>
            </li>
            <li className={s.rule}>
              <span className={s.ic}>
                <CreditCard weight="fill" aria-hidden="true" />
              </span>
              <div>
                <b>A renewal you did not mean to pay comes back in full</b>
                <span>
                  Up to {W.unwantedRenewalDays} days, as long as you have not used the plan since that payment.
                  Forgetting to cancel is not a thing we charge you for.
                </span>
              </div>
            </li>
            <li className={s.rule}>
              <span className={s.ic}>
                <ShieldCheck weight="fill" aria-hidden="true" />
              </span>
              <div>
                <b>If the fault is ours, you are refunded whatever the date</b>
                <span>
                  Charged twice, charged on a cancelled plan, or Jooma was not working. No time limit on that.
                </span>
              </div>
            </li>
            <li className={s.rule}>
              <span className={s.ic}>
                <Coins weight="fill" aria-hidden="true" />
              </span>
              <div>
                <b>Anything you made is yours to keep</b>
                <span>
                  A refund does not take your lessons away. Unspent top ups are refundable, spent ones are not.
                </span>
              </div>
            </li>
            <li className={s.rule}>
              <span className={s.ic}>
                <Sparkle weight="fill" aria-hidden="true" />
              </span>
              <div>
                <b>You can try Jooma for {TRIAL.days} days before paying anything</b>
                <span>
                  {daysInWords(TRIAL.days)} days of Pro, {TRIAL.resources} resources, no card. Most people never need
                  this page.
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <div className={s.wrap}>
        <main className={s.doc}>
          <section className={s.cl} id="c1">
            <p className={s.no}>Clause 1</p>
            <h2>Your legal rights come first</h2>
            <p>
              Nothing on this page takes away a right you have by law. If this policy and the law disagree, the law wins
              and we will apply it without being argued into it.
            </p>
            <p>
              If you are a consumer buying from us online in the UK, that includes a {STATUTORY_DAYS} day right to change
              your mind under the Consumer Contracts Regulations 2013, and the right to a repeat performance or a price
              reduction if what we supplied was not of satisfactory quality, not fit for purpose, or not as described,
              under the Consumer Rights Act 2015.
            </p>
          </section>

          <section className={s.cl} id="c2">
            <p className={s.no}>Clause 2</p>
            <h2>The {TRIAL.days} day trial, which is why this page is rarely needed</h2>
            <span className={`${s.vd} ${s.p}`}>
              <Sparkle weight="fill" aria-hidden="true" /> No card, nothing to refund
            </span>
            <p>
              Every new account gets {TRIAL.days} days of Pro with {TRIAL.resources} resources and no card details. When
              the {TRIAL.days} days end you are moved to the free plan rather than charged. Your library stays with you.
              Nobody is ever locked out of work they have already made.
            </p>
            <p>
              So by the time you pay us anything, you have made real lessons with the real product for {TRIAL.days} days.
              We would rather you spent those {TRIAL.days} days deciding than spent them reading this.
            </p>
          </section>

          <section className={s.cl} id="c3">
            <p className={s.no}>Clause 3</p>
            <h2>Monthly plans</h2>
            <span className={`${s.vd} ${s.y}`}>
              <CheckSquare weight="fill" aria-hidden="true" /> Full refund within {W.coolingOffDays} days
            </span>
            <p>
              Write to us within {W.coolingOffDays} days of any monthly payment and we refund that payment in full. We do
              not count what you used, we do not ask you to justify it, and we do not offer you three alternatives
              first. One short message is enough.
            </p>
            <p>
              After {W.coolingOffDays} days a monthly payment is not automatically refundable, because you have had most
              of the month. Cancel instead and you keep the plan until the period you have paid for runs out. Nothing
              further is taken.
            </p>
            <div className={s.aside}>
              <p>
                <strong>On the half price first month.</strong> If you took Pro at £{OFFER.firstMonthPrice.toFixed(2)} for
                your first month, that is what we refund. The discount is a one off, so if you come back later the price
                is the standard one.
              </p>
            </div>
          </section>

          <section className={s.cl} id="c4">
            <p className={s.no}>Clause 4</p>
            <h2>Yearly plans</h2>
            <span className={`${s.vd} ${s.y}`}>
              <CheckSquare weight="fill" aria-hidden="true" /> Full refund within {W.coolingOffDays} days
            </span>
            <p>
              Within {W.coolingOffDays} days of a yearly payment we refund it in full. We do not count what you used
              first. A yearly plan is a bigger commitment than a monthly one, so if anything the {W.coolingOffDays} days
              matter more here, and we are not going to hand them back to you with a deduction attached.
            </p>
            <p>
              The lessons you made during those {W.coolingOffDays} days stay in your library. We are not going to take
              work off a teacher because they asked for their money back.
            </p>

            <h3>After the first {W.coolingOffDays} days</h3>
            <p>
              A yearly plan is not refundable by default once the {W.coolingOffDays} days have passed, because the low
              yearly price is the whole reason it is low. But teaching is not a stable job to hold, and we would rather
              be asked than have you write us off:
            </p>
            <ul className={s.pts}>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>You are leaving teaching, or taking long term leave, and write to tell us</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>Your school or trust has bought a licence that now covers you</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>You have been made redundant</span>
              </li>
            </ul>
            <p>
              In those cases write to us and we will refund the whole months you have not used. We do not ask for
              evidence. We are aware that trusting people here costs us a little money and we have decided we would
              rather pay it.
            </p>
          </section>

          <section className={s.cl} id="c5">
            <p className={s.no}>Clause 5</p>
            <h2>Top ups</h2>
            <span className={`${s.vd} ${s.p}`}>
              <Coins weight="fill" aria-hidden="true" /> Refundable while unspent
            </span>
            <p>
              A top up is refundable in full for {W.topUpDays} days as long as you have not spent any of it. Once you
              start spending a top up it is not refundable, because what you bought has been delivered and is sitting in
              your library.
            </p>
            <p>
              Top up resources do not expire and do not disappear at the end of the month. They sit underneath your
              monthly allowance and are only touched once the allowance is gone. If you cancel your plan, any unspent top
              up resources stay on your account and still work.
            </p>
            <div className={s.aside}>
              <p>
                <strong>One thing worth knowing before you top up.</strong>{" "}
                <span className={s.pic}>
                  <Sparkle weight="fill" aria-hidden="true" />
                  Picture slideshows
                </span>{" "}
                cost considerably more than text resources, so a top up bought for picture work goes faster than the same
                top up spent on worksheets. The counter in your dashboard shows both separately, and we would rather you
                saw that before you bought than after.
              </p>
            </div>
          </section>

          <section className={s.cl} id="c6">
            <p className={s.no}>Clause 6</p>
            <h2>A renewal you did not mean to pay</h2>
            <span className={`${s.vd} ${s.y}`}>
              <CheckSquare weight="fill" aria-hidden="true" /> Full refund within {W.unwantedRenewalDays} days
            </span>
            <p>
              If your plan renewed and you had meant to cancel, tell us within {W.unwantedRenewalDays} days of that
              payment and we refund it in full, provided you have not used the plan since it was taken. There is nothing
              to explain and no form to fill in.
            </p>
            <p>
              We also do not think it is your job to remember. We email you before a yearly plan renews and before any
              price changes. If one of those emails did not arrive, that is on us, and clause 7 applies.
            </p>
          </section>

          <section className={s.cl} id="c7">
            <p className={s.no}>Clause 7</p>
            <h2>When the fault is ours</h2>
            <span className={`${s.vd} ${s.y}`}>
              <ShieldCheck weight="fill" aria-hidden="true" /> Always refunded, no time limit
            </span>
            <p>
              Some things are not a change of mind, they are a mistake, and the {W.coolingOffDays} and{" "}
              {W.unwantedRenewalDays} day limits on this page do not apply to them:
            </p>
            <ul className={s.pts}>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>You were charged twice for the same period</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>You were charged after cancelling</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>You were charged a price you had not agreed to</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>Jooma was unavailable or broken for a meaningful stretch of the period you paid for</span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>Resources were deducted for something that failed to generate, which we return to your balance as well</span>
              </li>
            </ul>
            <p>
              Write to us and we will fix it. If we got it wrong we will say so plainly rather than calling it a goodwill
              gesture.
            </p>
          </section>

          <section className={s.cl} id="c8">
            <p className={s.no}>Clause 8</p>
            <h2>Schools, trusts and other organisations</h2>
            <span className={`${s.vd} ${s.p}`}>
              <Buildings weight="fill" aria-hidden="true" /> Separate terms apply
            </span>
            <p>
              Buying for a school, a trust or a local authority is a business purchase, so consumer cancellation rights
              do not apply and your written agreement with us governs instead. As a default, where that agreement says
              nothing else:
            </p>
            <ul className={s.pts}>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>
                  Full refund within {W.unwantedRenewalDays} days of the invoice date if no staff accounts have been
                  activated
                </span>
              </li>
              <li className={s.ptYes}>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>After that, a refund of the whole months not yet used, at the per seat rate you agreed</span>
              </li>
              <li className={s.ptNo}>
                <XSquare weight="fill" aria-hidden="true" />
                <span>
                  Onboarding and training fees are not refundable once the onboarding has been delivered. If it has been
                  booked but not delivered, it is refunded in full
                </span>
              </li>
              <li className={s.ptNo}>
                <XSquare weight="fill" aria-hidden="true" />
                <span>
                  Seats removed partway through a term are not refunded individually. They are freed for someone else to
                  use
                </span>
              </li>
            </ul>
            <p>
              If a teacher at your school is already paying for Jooma personally when you buy a licence, tell us and we
              will refund the unused part of their personal subscription. They should not be paying twice for a decision
              made above them.
            </p>
          </section>

          <section className={s.cl} id="c9">
            <p className={s.no}>Clause 9</p>
            <h2>What we do not refund</h2>
            <span className={`${s.vd} ${s.n}`}>
              <XSquare weight="fill" aria-hidden="true" /> The short list
            </span>
            <ul className={s.pts}>
              <li className={s.ptNo}>
                <XSquare weight="fill" aria-hidden="true" />
                <span>
                  Top ups you have started spending, under clause 5. The lessons they produced stay in your library
                  either way
                </span>
              </li>
              <li className={s.ptNo}>
                <XSquare weight="fill" aria-hidden="true" />
                <span>Periods already served, beyond the windows set out above</span>
              </li>
              <li className={s.ptNo}>
                <XSquare weight="fill" aria-hidden="true" />
                <span>
                  Accounts closed by us for serious misuse, such as sharing one login across a staff room or reselling
                  what Jooma produces
                </span>
              </li>
            </ul>
            <p>
              That is the whole list. If something has gone wrong and it is not on this page, write to us anyway. A
              policy cannot anticipate every situation and we would rather hear about it than have you assume the answer
              is no.
            </p>
          </section>
        </main>

        <RefundsRail items={RAIL} />
      </div>

      <section className={s.ask} id="ask">
        <div className={s.askIn}>
          <h2>How to ask, and how long it takes</h2>
          <p>
            One email. No form, no phone queue, no retention script. A person reads it and answers within{" "}
            <strong>two working days</strong>, and once approved the money goes back to the card you paid with, which
            takes <strong>five to ten working days</strong> to appear depending on your bank.
          </p>
          <p>
            You do not have to tell us why. If you want to, we read every one of those, and it is the most useful post we
            get.
          </p>
          <a className={s.mail} href={MAIL}>
            <EnvelopeSimple weight="fill" aria-hidden="true" /> {CONTACT_EMAIL}
          </a>
          <div className={s.need}>
            <p className={s.needLbl}>Helpful to include</p>
            <ul>
              <li>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>The email address on your Jooma account</span>
              </li>
              <li>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>Roughly when you were charged, if you know</span>
              </li>
              <li>
                <CheckSquare weight="fill" aria-hidden="true" />
                <span>Whether you want the plan cancelled as well, or kept running to the end of the period</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className={s.foot}>
        <div className={s.footIn}>
          <p>© 2026 Jooma. Built for teachers.</p>
          <nav>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/#pricing">Pricing</Link>
            <a href={MAIL}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
