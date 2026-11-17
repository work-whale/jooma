/*
 * The sidebar's resources meter, from the v4 prototype.
 *
 * Calm until it matters: with plenty left it states the allowance and shows no
 * bar, because a bar on a full tank is noise. Below 40% a bar and "N left";
 * below 15% it is low and a top-up is offered (where the plan allows one).
 */

export type MeterState = "calm" | "watch" | "low";

export const WATCH_BELOW = 0.4;
export const LOW_AT = 0.15;

export function meterState(left: number, allowance: number): MeterState {
  if (allowance <= 0) return "low";
  const fraction = Math.max(0, left) / allowance;
  if (fraction > WATCH_BELOW) return "calm";
  if (fraction > LOW_AT) return "watch";
  return "low";
}

export function meterValue(m: { left: number; allowance: number; period: "week" | "month" }): string {
  if (meterState(m.left, m.allowance) === "calm") {
    return `${m.allowance.toLocaleString("en-GB")} a ${m.period}`;
  }
  return `${Math.max(0, Math.round(m.left)).toLocaleString("en-GB")} left`;
}
