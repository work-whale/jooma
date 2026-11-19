/*
 * When an allowance starts and refills, in UK time (Jooma 4.5 spec, Step 2).
 *
 *   Free      every Sunday at 00:00 Europe/London, set back to 50.
 *   Paid      00:00 UK time on the day of the month the plan started, clamped
 *             to the month's length (a plan started on the 31st refills on the
 *             28th in February). Yearly plans refill monthly too.
 *   Trial     ends 23:59 UK time on the UK signup date plus ten days.
 *
 * Pure: every function takes `now` rather than reading the clock, so the
 * resources balance can roll periods forward lazily on read or spend, and the
 * tests can stand on the night the clocks change.
 *
 * No date library. Intl gives the UK wall clock for any instant, and
 * `fromLondon` inverts it by correcting a UTC guess with the zone's offset at
 * that guess. That is exact except inside the hour that does not exist when
 * the clocks go forward (01:00 to 02:00 on the last Sunday of March), and
 * nothing here ever asks for a time in that hour: refills are at midnight and
 * the trial ends at 23:59.
 */

import { PLAN_TIMEZONE } from "@/app/lib/plan-config";

export interface Period {
  /** The instant this period's allowance was set. */
  start: Date;
  /** The instant it is next set. */
  next: Date;
}

export interface CalendarDate {
  y: number;
  /** 1 to 12. */
  m: number;
  d: number;
}

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLAN_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function londonParts(at: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of PARTS.formatToParts(at)) p[type] = value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    mi: Number(p.minute),
    s: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** The calendar date in the UK at this instant. */
export function londonDate(at: Date): CalendarDate {
  const { y, m, d } = londonParts(at);
  return { y, m, d };
}

/** UK wall-clock time to the instant. Month may overflow (13 is next January),
 *  and day may too: Date.UTC normalises both. */
function fromLondon(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const wall = Date.UTC(y, m - 1, d, h, mi, s);
  // The offset at the guess. Equal to the offset at the answer everywhere
  // except the skipped spring hour, which is never asked for (see the header).
  const seen = londonParts(new Date(wall));
  const seenWall = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.mi, seen.s);
  return new Date(wall - (seenWall - wall));
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Free's week: the Sunday midnight at or before `now`, and the next one. */
export function freePeriod(now: Date): Period {
  const p = londonParts(now);
  const start = fromLondon(p.y, p.m, p.d - p.weekday);
  const next = fromLondon(p.y, p.m, p.d - p.weekday + 7);
  return { start, next };
}

/**
 * A paid plan's month. `startDay` is the day of the month the plan started
 * (1 to 31); anything outside that is clamped rather than thrown, because a
 * bad value in a row must still give the teacher a working balance.
 */
export function monthlyPeriod(startDay: number, now: Date): Period {
  const day = Math.min(31, Math.max(1, Math.floor(startDay) || 1));
  const at = (y: number, m: number) => {
    // Normalise a month that ran past 12 or below 1.
    const yy = y + Math.floor((m - 1) / 12);
    const mm = ((((m - 1) % 12) + 12) % 12) + 1;
    return fromLondon(yy, mm, Math.min(day, daysInMonth(yy, mm)));
  };
  const { y, m } = londonParts(now);
  let start = at(y, m);
  let startMonth = m;
  if (start.getTime() > now.getTime()) {
    startMonth = m - 1;
    start = at(y, startMonth);
  }
  return { start, next: at(y, startMonth + 1) };
}

/** 23:59:59 UK time on the UK signup date plus the trial's days. */
export function trialEndsAt(signup: Date, days = 10): Date {
  const { y, m, d } = londonDate(signup);
  return fromLondon(y, m, d + days, 23, 59, 59);
}

/** UK midnight at the start of the day after `now`. */
export function nextLondonMidnight(now: Date): Date {
  const { y, m, d } = londonDate(now);
  return fromLondon(y, m, d + 1);
}

/** An instant for a UK wall-clock time on a UK date (day may overflow). */
export function londonTime(date: CalendarDate, h: number, mi = 0): Date {
  return fromLondon(date.y, date.m, date.d, h, mi);
}
