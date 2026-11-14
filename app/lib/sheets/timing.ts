/**
 * Timed running orders (a meeting agenda, an assembly). The model suggests
 * minutes per item; code makes them add up to the length the teacher asked
 * for, so the page never says "60 minutes" over items that come to 72.
 */

export interface TimedItem {
  label: string;
  minutes: number;
  /** Clock times ("15:30"), only when a start time was given. */
  from?: string;
  to?: string;
}

const validMinutes = (m: unknown): m is number => typeof m === "number" && Number.isFinite(m) && m > 0;

/** "8:45" or "15:30" as minutes after midnight; null for anything else. */
export function parseClock(start: string | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(start ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const clock = (mins: number) => {
  const t = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Scales the items' minutes to `total`, rounding to 5 minutes from a 30
 * minute length (1 below it, or when 5 each would not fit), never below one
 * step per item, with any remainder on the last item. A missing or silly
 * length keeps the model's minutes. Adds clock times from `start`.
 */
export function timedItems(items: { label: string; minutes: number }[], total: number, start?: string): TimedItem[] {
  if (!items.length) return [];
  const valid = items.filter((i) => validMinutes(i.minutes));
  const fallback = valid.length ? valid.reduce((n, i) => n + i.minutes, 0) / valid.length : 1;

  let minutes: number[];
  if (!validMinutes(total)) {
    minutes = items.map((i) => (validMinutes(i.minutes) ? Math.round(i.minutes) : Math.round(fallback)) || 1);
  } else {
    const length = Math.round(total);
    const n = items.length;
    if (n >= length) {
      minutes = items.map(() => 1);
    } else {
      const unit = length >= 30 && n * 5 <= length ? 5 : 1;
      const raw = valid.length ? items.map((i) => (validMinutes(i.minutes) ? i.minutes : fallback)) : items.map(() => 1);
      const scale = length / raw.reduce((a, b) => a + b, 0);
      minutes = raw.map((m) => Math.max(unit, Math.round((m * scale) / unit) * unit));
      const last = n - 1;
      minutes[last] += length - minutes.reduce((a, b) => a + b, 0);
      // The last item went below one step: take steps from the biggest others.
      while (minutes[last] < unit) {
        let big = -1;
        for (let i = 0; i < last; i++) if (minutes[i] > unit && (big < 0 || minutes[i] > minutes[big])) big = i;
        if (big < 0) break;
        minutes[big] -= unit;
        minutes[last] += unit;
      }
    }
  }

  let at = parseClock(start);
  return items.map((item, i) => {
    const row: TimedItem = { label: item.label, minutes: minutes[i] };
    if (at !== null) {
      row.from = clock(at);
      at += minutes[i];
      row.to = clock(at);
    }
    return row;
  });
}
