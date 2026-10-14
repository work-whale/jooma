"use client";

import { useState } from "react";
import {
  AGREEMENT_MONTHS,
  AMBASSADOR_RATES,
  EXAMPLE_CHURN,
  gbp,
  workedExample,
} from "@/app/lib/ambassador-commission";
import s from "./programme.module.css";

/** One gold per intake month, oldest darkest, so the bands read in order. */
function rampColour(i: number, n: number): string {
  const dark = [169, 118, 26];
  const light = [246, 227, 181];
  const t = n <= 1 ? 0 : i / (n - 1);
  const mix = dark.map((d, k) => Math.round(d + (light[k] - d) * t));
  return `rgb(${mix.join(",")})`;
}

const wholePounds = (pence: number) =>
  (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

/**
 * A thousand teachers on Pro, put through the rate card. Arithmetic, not a
 * forecast, computed from AMBASSADOR_RATES so it can never disagree with the
 * agreement. Earnings stop when the agreement does, which is why a teacher
 * signed late in the year earns less than one signed early.
 */
export default function WorkedExample() {
  const [mode, setMode] = useState<"stay" | "churn">("stay");
  const months = workedExample(mode === "stay" ? 0 : EXAMPLE_CHURN);
  const rate = AMBASSADOR_RATES.month.pro;
  const max = Math.max(...months.map((m) => m.paying), 1);
  const last = months[months.length - 1];

  return (
    <div className={s.wex}>
      <span className={s.wexEye}>A worked example</span>
      <h3>A thousand teachers on Pro.</h3>
      <p className={s.lead} style={{ fontSize: ".9rem", maxWidth: 640 }}>
        This is the rate card above with a number put through it. It is arithmetic, not a forecast:
        we are not telling you what you will do, only what the rate pays if you do it.
      </p>

      <div className={s.wpair}>
        <div className={s.wtile}>
          <span className={s.wtileLabel}>1,000 teachers on Pro</span>
          <span className={s.wtileValue}>{wholePounds(1000 * rate)}</span>
          <span className={s.wtileSub}>Paid to you every month they pay, while your agreement runs.</span>
        </div>
        <span className={s.wop}>× {AGREEMENT_MONTHS} months</span>
        <div className={`${s.wtile} ${s.wtileGold}`}>
          <span className={s.wtileLabel}>If all of them joined in month one</span>
          <span className={s.wtileValue}>{wholePounds(1000 * rate * AGREEMENT_MONTHS)}</span>
          <span className={s.wtileSub}>Twelve payments of the figure on the left. Nothing extra to do in between.</span>
        </div>
      </div>

      <hr />

      <div className={s.wbh}>
        <div>
          <h4>You will not get a thousand on day one.</h4>
          <p>
            So here is the same thousand arriving over your year. Each month you keep earning on
            everyone from the months before, until the agreement ends.
          </p>
        </div>
        <div className={s.segm} role="group" aria-label="Example">
          <button
            type="button"
            className={mode === "stay" ? s.segOn : undefined}
            aria-pressed={mode === "stay"}
            onClick={() => setMode("stay")}
          >
            If they stay
          </button>
          <button
            type="button"
            className={mode === "churn" ? s.segOn : undefined}
            aria-pressed={mode === "churn"}
            onClick={() => setMode("churn")}
          >
            With real churn
          </button>
        </div>
      </div>

      <div className={`${s.chart} ${s.chartTall}`} role="img" aria-label="Teachers paying you each month, by the month they joined">
        {months.map((m) => {
          const h = (m.paying / max) * 100;
          return (
            <div key={m.month} className={s.col} tabIndex={0}>
              <span className={s.tip}>
                Month {m.month}: {m.paying.toLocaleString("en-GB")} paying, {gbp(m.earnedPence)}
              </span>
              <span className={s.colVal}>{wholePounds(m.earnedPence)}</span>
              <div className={s.stack} style={{ height: `${h}%` }}>
                {m.byIntake.map((n, i) => (
                  <div
                    key={i}
                    className={s.seg}
                    style={{
                      flex: n,
                      backgroundColor: rampColour(i, AGREEMENT_MONTHS),
                    }}
                  />
                ))}
              </div>
              <span className={s.colLab}>M{m.month}</span>
            </div>
          );
        })}
      </div>
      <div className={s.keys}>
        <span className={s.key}>
          <i style={{ background: "linear-gradient(90deg,#A9761A,#F6E3B5)" }} />
          Each band is one month&apos;s intake, still paying you
        </span>
        <span>
          {mode === "stay"
            ? "Nobody leaves, so every band stays its full height."
            : `${Math.round(EXAMPLE_CHURN * 100)}% of paying teachers leave each month.`}
        </span>
      </div>

      <hr />

      <div className={s.scrollX}>
        <table className={s.t} style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th>Month</th>
              <th className={s.num}>Teachers you sign</th>
              <th className={s.num}>Teachers paying you</th>
              <th className={s.num}>You earn that month</th>
              <th className={s.num}>Earned so far</th>
              <th className={s.num}>That intake, to the end of the year</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>
                  <span className={s.planSw}>
                    <i style={{ backgroundColor: rampColour(m.month - 1, AGREEMENT_MONTHS) }} />
                    Month {m.month}
                  </span>
                </td>
                <td className={s.num}>{m.signed.toLocaleString("en-GB")}</td>
                <td className={s.num}>{m.paying.toLocaleString("en-GB")}</td>
                <td className={s.num}>{gbp(m.earnedPence)}</td>
                <td className={s.num}>{gbp(m.cumulativePence)}</td>
                <td className={s.num}>{gbp(m.intakeToEndPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.wfoot}>
        <div className={s.wfc}>
          <span className={s.k}>Earned across the twelve months</span>
          <span className={s.n}>{gbp(last.cumulativePence)}</span>
          <span className={s.d}>
            {mode === "stay" ? "If everyone you sign keeps paying." : "With teachers leaving as they do."}
          </span>
        </div>
        <div className={`${s.wfc} ${s.wfcB}`}>
          <span className={s.k}>Where you finish the year</span>
          <span className={s.n}>{gbp(last.earnedPence)} a month</span>
          <span className={s.d}>{last.paying.toLocaleString("en-GB")} teachers paying you in month twelve.</span>
        </div>
      </div>

      <div className={`${s.callout} ${s.calloutGold}`} style={{ maxWidth: "none" }}>
        <span>
          Commission is earned on payments made while your agreement runs. A teacher you sign in
          month twelve earns you one month&apos;s rate; one you sign in month one earns you twelve.
        </span>
      </div>
    </div>
  );
}
