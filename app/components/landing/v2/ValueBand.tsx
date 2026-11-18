import { PLANS, planCredits } from "@/app/lib/plans";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./ValueBand.module.css";

/**
 * The Pro proposition in three numbers.
 *
 * Price and credits come from PLANS rather than being typed here, so this band
 * cannot quote a figure the checkout does not charge or an allowance the guard
 * does not grant.
 */
export default function ValueBand() {
  const pro = PLANS.pro;
  const credits = planCredits("pro");
  const toolCount = 35;

  return (
    <section className={shared.sec}>
      <div className={shared.shell}>
        <Reveal className={styles.band}>
          <h2>£{pro.priceMonthly?.toFixed(2)} a month. Everything included.</h2>
          <div className={styles.row}>
            <div className={styles.cell}>
              <p className={styles.figure}>{credits?.toLocaleString("en-GB")}</p>
              <p className={styles.caption}>resources a month, spent however you like</p>
            </div>
            <div className={styles.cell}>
              <p className={styles.figure}>{toolCount}</p>
              <p className={styles.caption}>tools, nothing locked behind a higher tier</p>
            </div>
            <div className={styles.cell}>
              <p className={styles.figure}>Free</p>
              <p className={styles.caption}>to refine anything you have already made</p>
            </div>
          </div>
          <p className={styles.foot}>Cancel any time. Everything you make stays yours.</p>
        </Reveal>
      </div>
    </section>
  );
}
