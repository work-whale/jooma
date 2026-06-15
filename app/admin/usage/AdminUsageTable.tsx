"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Check, ChevronRight, ChevronDown } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import { nf, usd, fmtDateTime } from "../format";

export interface AdminUsageRow {
  tool_slug: string;
  generations: number;
  cost_usd: number;
  last_used: string | null;
  /** Cost breakdown rows. For the slideshow these are per-slide all-in costs;
   *  for other tools they're the contributing steps. Present only when there are
   *  2+ rows. */
  children?: { label: string; cost_usd: number }[];
}

const perGen = (cost: number, gens: number) => (gens > 0 ? cost / gens : cost);

export default function AdminUsageTable({ rows }: { rows: AdminUsageRow[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleExpand = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const totals = rows.reduce(
    (a, r) => ({ generations: a.generations + r.generations, cost_usd: a.cost_usd + r.cost_usd }),
    { generations: 0, cost_usd: 0 },
  );
  const totalEach = perGen(totals.cost_usd, totals.generations);

  // Only tools that actually have usage can be reset.
  const resettable = (slug: string) => rows.find((r) => r.tool_slug === slug)?.generations ?? 0;

  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const withData = rows.filter((r) => r.generations > 0).map((r) => r.tool_slug);
  const allSelected = withData.length > 0 && withData.every((s) => selected.has(s));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(withData));

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const handleReset = async () => {
    const slugs = [...selected].filter((s) => resettable(s) > 0);
    if (slugs.length === 0) return;
    const names = slugs.map(typeLabel).join(", ");
    if (!confirm(`Reset all recorded usage for ${names} across ALL users? This permanently deletes the data.`))
      return;

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_reset_tool_usage", { slugs });
      if (error) {
        alert("Could not reset usage. Please try again.");
        return;
      }
      exitSelect();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-3">
        {!selecting ? (
          <button
            type="button"
            onClick={() => setSelecting(true)}
            className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
            style={{ borderColor: "#DAD8D0", color: "#1a1a1a" }}
          >
            Select
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
              style={{ borderColor: "#DAD8D0", color: "#1a1a1a" }}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={selected.size === 0 || busy}
              className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "#E0463F" }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reset{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button
              type="button"
              onClick={exitSelect}
              disabled={busy}
              className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5 disabled:opacity-40"
              style={{ borderColor: "#DAD8D0", color: "#1a1a1a" }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "#8a8078" }} className="text-left">
              {selecting && <th className="px-4 py-3 w-10" />}
              <th className="font-semibold px-4 py-3">Tool</th>
              <th className="font-semibold px-4 py-3 text-right">Generations</th>
              <th className="font-semibold px-4 py-3 text-right">Last used</th>
              <th className="font-semibold px-4 py-3 text-right">Total</th>
              <th className="font-semibold px-4 py-3 text-right">Average per gen</th>
              <th className="font-semibold px-4 py-3 text-right">Average per 10</th>
              <th className="font-semibold px-4 py-3 text-right">~100x</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const each = perGen(r.cost_usd, r.generations);
              const unused = r.generations === 0;
              const isOn = selected.has(r.tool_slug);
              const selectable = selecting && r.generations > 0;
              const hasChildren = !!r.children?.length;
              const isExpanded = expanded.has(r.tool_slug);
              return (
                <Fragment key={r.tool_slug}>
                  <tr
                    className="border-t"
                    style={{ borderColor: "#EEECE4", backgroundColor: isOn ? "#F1EFE3" : undefined }}
                    onClick={selectable ? () => toggle(r.tool_slug) : undefined}
                  >
                    {selecting && (
                      <td className="px-4 py-3">
                        {r.generations > 0 && (
                          <span
                            className="flex items-center justify-center w-4 h-4 rounded border"
                            style={{
                              borderColor: isOn ? "#E0463F" : "#C9C5B8",
                              backgroundColor: isOn ? "#E0463F" : "transparent",
                            }}
                          >
                            {isOn && <Check className="w-3 h-3 text-white" />}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium" style={{ color: unused ? "#8a8078" : "#1a1a1a" }}>
                      <div className="flex items-center gap-1.5">
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(r.tool_slug);
                            }}
                            className="hover:opacity-70 shrink-0"
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <Link
                          href={`/admin/usage/${r.tool_slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {typeLabel(r.tool_slug)}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {nf.format(r.generations)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: "#8a8078" }}>
                      {fmtDateTime(r.last_used)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: unused ? "#8a8078" : "#1a1a1a" }}>
                      {usd(r.cost_usd)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each * 10)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each * 100)}
                    </td>
                  </tr>
                  {hasChildren &&
                    isExpanded &&
                    r.children!.map((c, i) => (
                      <tr key={`${r.tool_slug}:${c.label}:${i}`} style={{ backgroundColor: "#F6F4EC" }}>
                        {selecting && <td />}
                        <td className="pl-10 pr-4 py-2 text-sm" style={{ color: "#6b6055" }}>
                          {c.label}
                        </td>
                        <td colSpan={2} />
                        <td className="px-4 py-2 text-right text-sm" style={{ color: "#6b6055" }}>
                          {usd(c.cost_usd)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: "#DAD8D0" }}>
              {selecting && <td className="px-4 py-3" />}
              <td className="px-4 py-3 font-bold" style={{ color: "#1a1a1a" }}>
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                {nf.format(totals.generations)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right font-bold" style={{ color: "#1a1a1a" }}>
                {usd(totals.cost_usd)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                {usd(totalEach)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                {usd(totalEach * 10)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                {usd(totalEach * 100)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
