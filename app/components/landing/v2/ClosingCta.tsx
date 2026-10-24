import Link from "next/link";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";
import { inWords } from "@/app/lib/landing/faq";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./ClosingCta.module.css";

export default function ClosingCta() {
  return (
    <div className={shared.shell}>
      <Reveal className={styles.close} as="section">
        <h2>Let&apos;s give teachers their evenings back.</h2>
        {/* The real free offer, the same one the FAQ states: free tries on
            this page with no account, then a trial on every plan. It used to
            say "five free resources a month", which no account has had since
            the free plan was retired, and before that the prototype's
            "hundred credits", which no signup ever got. */}
        <p>
          Try it free on this page, {inWords(FREE_TRIES_PER_DAY)} times a day. Every plan then
          starts with {inWords(TRIAL_DAYS)} days free.
        </p>
        <div className={styles.row}>
          <Link href="/signup" className={`${shared.btn} ${shared.btnW}`}>
            Start free trial
          </Link>
          <Link href="/contact?type=school" className={`${shared.btn} ${shared.btnO}`}>
            Book a school demo
          </Link>
        </div>
        <small>Set up in under a minute</small>
      </Reveal>
    </div>
  );
}
