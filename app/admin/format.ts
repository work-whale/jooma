// Shared formatters for the admin pages.
export const nf = new Intl.NumberFormat("en-GB");

export const usd = (n: number) => {
  const v = Number(n) || 0;
  return v > 0 ? `$${v.toFixed(v < 0.1 ? 4 : 2)}` : "$0.00";
};

export const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
