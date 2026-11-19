"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Charges come from Stripe, not our invoices mirror — see the refund route for
// why. Refunds are per-charge and deliberately not a bulk action: each one
// wants a human looking at what's being sent back.

interface Charge {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  created: number;
  description: string | null;
}

const fieldClass =
  "w-full px-3.5 py-2.5 border rounded-xl bg-white text-sm font-medium placeholder-[#9A93AD] focus:outline-none focus:border-[#1D1730] transition-colors";
const fieldStyle = { borderColor: "#EAE6F5" };

function money(pence: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(pence / 100);
}

export default function RefundModal({
  userId,
  name,
  onClose,
  onRefunded,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onRefunded: (msg: string) => void;
}) {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [chargeId, setChargeId] = useState<string>("");
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/teachers/refund?userId=${encodeURIComponent(userId)}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Could not load charges.");
        setCharges([]);
        return;
      }
      setCharges(json.charges ?? []);
      setChargeId(json.charges?.[0]?.id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const selected = charges?.find((c) => c.id === chargeId) ?? null;
  const refundable = selected ? selected.amount - selected.amountRefunded : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargeId || !reason.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/teachers/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        chargeId,
        reason: reason.trim(),
        // Omitted means "refund the full remaining amount" server-side.
        amountPence: partial ? Math.round(Number(amount) * 100) : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not issue the refund.");
      setSaving(false);
      return;
    }
    onRefunded(
      `Refunded ${money(json.amount, selected?.currency ?? "gbp")}.`,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-1010 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh]"
        style={{ borderColor: "#EAE6F5", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex items-start gap-3 p-5 pb-4 border-b" style={{ borderColor: "#EAE6F5" }}>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold" style={{ color: "#1D1730" }}>
              Refund
            </h2>
            <p className="text-sm mt-0.5 truncate" style={{ color: "#6D6683" }}>
              {name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            style={{ color: "#6D6683" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {charges === null ? (
            <p className="text-sm" style={{ color: "#6D6683" }}>
              Loading charges…
            </p>
          ) : charges.length === 0 ? (
            <p className="text-sm" style={{ color: "#6D6683" }}>
              No refundable charges for this teacher.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                {charges.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer"
                    style={{
                      borderColor: chargeId === c.id ? "#1D1730" : "#EAE6F5",
                      backgroundColor: chargeId === c.id ? "#FAF9FC" : "#fff",
                    }}
                  >
                    <input
                      type="radio"
                      name="charge"
                      checked={chargeId === c.id}
                      onChange={() => setChargeId(c.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "#1D1730" }}>
                        {money(c.amount - c.amountRefunded, c.currency)}
                        {c.amountRefunded > 0 && (
                          <span className="font-normal" style={{ color: "#6D6683" }}>
                            {" "}
                            left of {money(c.amount, c.currency)}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs font-mono truncate" style={{ color: "#6D6683" }}>
                        {new Date(c.created * 1000).toLocaleDateString("en-GB")} · {c.description ?? c.id}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ color: "#3C3552" }}>
                <input
                  type="checkbox"
                  checked={partial}
                  onChange={(e) => setPartial(e.target.checked)}
                />
                <span>Refund part of it</span>
              </label>

              {partial && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                    Amount ({(selected?.currency ?? "gbp").toUpperCase()}) — up to{" "}
                    {money(refundable, selected?.currency ?? "gbp")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(refundable / 100).toFixed(2)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                  Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Goes in the audit log"
                  className={fieldClass}
                  style={fieldStyle}
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm" style={{ color: "#B3261E" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold rounded-xl border px-4 py-2 transition-colors hover:bg-black/5"
            style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!chargeId || !reason.trim() || saving}
            className="text-sm font-semibold rounded-xl px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: "#B3261E" }}
          >
            {saving ? "Refunding…" : "Issue refund"}
          </button>
        </div>
      </form>
    </div>
  );
}
