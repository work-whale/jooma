/*
 * When something was made, the way the v4 recent list says it: "Just now",
 * "40 minutes ago", "6 hours ago", "Yesterday", "Wednesday", "6 Nov", and the
 * year once it is not this one. Calendar days in local time.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function whenLabel(made: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - made.getTime());
  const days = Math.round((startOfDay(now) - startOfDay(made)) / 86_400_000);

  if (days <= 0) {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[made.getDay()]!;
  const sameYear = made.getFullYear() === now.getFullYear();
  return made.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
