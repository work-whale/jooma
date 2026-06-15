"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";
import { typeLabel } from "@/app/lib/toolRunDisplay";

export interface ReportRow {
  tool_slug: string;
  generations: number;
  total_tokens: number;
  text_cost_usd: number;
  asset_cost_usd: number;
  cost_usd: number;
}

const nf = new Intl.NumberFormat("en-GB");
const usd = (n: number) => (n > 0 ? `$${n.toFixed(n < 0.1 ? 4 : 2)}` : "—");
// Average cost of one generation; guards the zero case so a tool with only asset
// rows (no counted text generation) doesn't divide by zero.
const perGen = (cost: number, gens: number) => (gens > 0 ? cost / gens : cost);

export default function UsageTable({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const totals = rows.reduce(
    (acc, r) => ({
      generations: acc.generations + Number(r.generations),
      cost_usd: acc.cost_usd + Number(r.cost_usd),
    }),
    { generations: 0, cost_usd: 0 },
  );
  const totalEach = perGen(totals.cost_usd, totals.generations);

  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.tool_slug)));

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const handleReset = async () => {
    if (selected.size === 0) return;
    const slugs = [...selected];
    const names = slugs.map(typeLabel).join(", ");
    if (!confirm(`Reset all recorded usage for ${names}? This permanently deletes the data.`)) return;

    setBusy(true);
    try {
      const supabase = createClient();
      const [a, b] = await Promise.all([
        supabase.from("token_usage").delete().in("tool_slug", slugs),
        supabase.from("asset_cost").delete().in("tool_slug", slugs),
      ]);
      if (a.error || b.error) {
        alert("Could not reset usage. Please try again.");
        return;
      }
      exitSelect();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 border text-sm"
        style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0", color: "#6b6055" }}
      >
        No generations yet this month.
      </div>
    );
  }

  return (
    <>
      {/* Toolbar: enter selection mode, or act on the current selection. */}
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
              <th className="font-semibold px-4 py-3 text-right">Total</th>
              <th className="font-semibold px-4 py-3 text-right">Average per gen</th>
              <th className="font-semibold px-4 py-3 text-right">Average per 10</th>
              <th className="font-semibold px-4 py-3 text-right">~100x</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const each = perGen(Number(r.cost_usd), Number(r.generations));
              const isOn = selected.has(r.tool_slug);
              return (
                <tr
                  key={r.tool_slug}
                  className="border-t cursor-default"
                  style={{ borderColor: "#EEECE4", backgroundColor: isOn ? "#F1EFE3" : undefined }}
                  onClick={selecting ? () => toggle(r.tool_slug) : undefined}
                >
                  {selecting && (
                    <td className="px-4 py-3">
                      <span
                        className="flex items-center justify-center w-4 h-4 rounded border"
                        style={{
                          borderColor: isOn ? "#E0463F" : "#C9C5B8",
                          backgroundColor: isOn ? "#E0463F" : "transparent",
                        }}
                      >
                        {isOn && <Check className="w-3 h-3 text-white" />}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium" style={{ color: "#1a1a1a" }}>
                    {typeLabel(r.tool_slug)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                    {nf.format(Number(r.generations))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                    {usd(Number(r.cost_usd))}
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
