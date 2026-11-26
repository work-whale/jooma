"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RefundOption } from "@/app/lib/refund-policy";
import { usePermissions } from "./usePermissions";

// Charges come from Stripe, not our invoices mirror — see the refund route for
// why. Refunds are per-charge and deliberately not a bulk action: each one
// wants a human looking at what's being sent back.
//
// The refund policy (docs/18-jooma-refund-policy.html, /refunds) is shown as
// ADVICE: each charge says what it was and whether it is inside the policy's
// windows, and the admin can pick the rule that applies to pre-fill the amount
// and the reason. Nothing here, and nothing in the route, stops a refund the
// policy does not cover: clause 9 says "write to us anyway".

interface Charge {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  created: number;
  description: string | null;
  // From the policy engine. Absent when the route could not work them out, in
  // which case the modal behaves as it always did.
  label?: string;
  inPolicy?: boolean;
  options?: RefundOption[];
  facts?: { kind: "subscription" | "topup" | "other"; interval: "month" | "year" | null };
}

/** The clause behind the green chip: the first plain window that applies. */
function windowClause(c: Charge): number | null {
  const o = c.options?.find((x) => x.rule !== "our_fault" && x.rule !== "yearly_unused_months");
  return o ? o.clause : null;
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
  // The policy rule picked for the selected charge ("" = none, my own reason).
  const [rule, setRule] = useState<string>("");
  // The reason text we filled in ourselves, so picking another rule can swap it
  // without overwriting something the admin typed.
  const [prefilled, setPrefilled] = useState("");
  const [endPlan, setEndPlan] = useState(false);
  // Set once a refund has gone through but the plan could not be ended, so the
  // button cannot be pressed again and refund a second time.
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { can } = usePermissions();

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
  const chosen = selected?.options?.find((o) => o.rule === rule) ?? null;
  const canEndPlan = selected?.facts?.kind === "subscription" && can("change_plan");

  // Picking a rule sets the amount (a part refund when the rule is for less
  // than what is left) and pre-fills the reason with the rule's own words.
  const pickRule = (value: string, forCharge: string) => {
    setRule(value);
    const c = charges?.find((x) => x.id === forCharge);
    const o = c?.options?.find((x) => x.rule === value);
    if (!o || !c) {
      setPartial(false);
      setAmount("");
      if (reason === prefilled) {
        setReason("");
        setPrefilled("");
      }
      return;
    }
    if (o.amount < c.amount - c.amountRefunded) {
      setPartial(true);
      setAmount((o.amount / 100).toFixed(2));
    } else {
      setPartial(false);
      setAmount("");
    }
    if (reason === "" || reason === prefilled) {
      setReason(o.label);
      setPrefilled(o.label);
    }
  };

  // Picking another charge drops a rule picked for the last one.
  const pickCharge = (id: string) => {
    setChargeId(id);
    pickRule("", id);
    setEndPlan(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargeId || !reason.trim() || saving || done) return;
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
        // Which policy rule this was, for the audit log. Omitted for "my own reason".
        rule: rule || undefined,
        interval: selected?.facts?.interval ?? undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not issue the refund.");
      setSaving(false);
      return;
    }
    const refunded = `Refunded ${money(json.amount, selected?.currency ?? "gbp")}.`;

    // Optionally end the plan too, once the money is on its way back. Only
    // offered to admins who may change plans; the route checks that again.
    if (endPlan && canEndPlan) {
      const planRes = await fetch("/api/admin/teachers/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan: "free", reason: reason.trim(), immediate: true }),
      });
      const planJson = await planRes.json().catch(() => ({}));
      if (!planRes.ok) {
        // The refund is already made, so say so and stop: pressing the button
        // again would refund a second time.
        onRefunded(refunded);
        setError(`Refunded, but the plan could not be ended: ${planJson.error ?? "unknown error"}`);
        setDone(true);
        setSaving(false);
        return;
      }
      onRefunded(`${refunded} Their plan has ended.`);
      onClose();
      return;
    }
    onRefunded(refunded);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-1010 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh]"
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
                {charges.map((c) => {
                  const clause = windowClause(c);
                  return (
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
                        onChange={() => pickCharge(c.id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span
                          className="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm font-semibold"
                          style={{ color: "#1D1730" }}
                        >
                          <span>
                            {money(c.amount - c.amountRefunded, c.currency)}
                            {c.amountRefunded > 0 && (
                              <span className="font-normal" style={{ color: "#6D6683" }}>
                                {" "}
                                left of {money(c.amount, c.currency)}
                              </span>
                            )}
                          </span>
                          {c.label && (
                            <span className="font-normal" style={{ color: "#3C3552" }}>
                              {c.label}
                            </span>
                          )}
                          {c.options && (
                            <span
                              data-testid="policy-chip"
                              className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                              style={
                                c.inPolicy
                                  ? { backgroundColor: "#E6F4EE", color: "#0F8A63" }
                                  : { backgroundColor: "#F1EFF6", color: "#6D6683" }
                              }
                            >
                              {c.inPolicy && clause ? `In policy: clause ${clause}` : "Outside the windows"}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs font-mono truncate" style={{ color: "#6D6683" }}>
                          {new Date(c.created * 1000).toLocaleDateString("en-GB")} · {c.description ?? c.id}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {selected?.options && selected.options.length > 0 && (
                <fieldset className="space-y-1.5" data-testid="policy-options">
                  <legend className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                    What the refund policy allows
                  </legend>
                  {selected.options.map((o) => (
                    <label
                      key={o.rule}
                      className="flex items-start gap-2.5 rounded-xl border px-3 py-2 cursor-pointer"
                      style={{
                        borderColor: rule === o.rule ? "#1D1730" : "#EAE6F5",
                        backgroundColor: rule === o.rule ? "#FAF9FC" : "#fff",
                      }}
                    >
                      <input
                        type="radio"
                        name="rule"
                        className="mt-1"
                        checked={rule === o.rule}
                        onChange={() => pickRule(o.rule, chargeId)}
                      />
                      <span className="flex-1 min-w-0 text-sm" style={{ color: "#1D1730" }}>
                        <span className="font-semibold">{o.label}</span>
                        <span className="font-normal" style={{ color: "#6D6683" }}>
                          {" "}
                          · {money(o.amount, selected.currency)}
                        </span>
                      </span>
                    </label>
                  ))}
                  <label
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer text-sm"
                    style={{
                      borderColor: rule === "" ? "#1D1730" : "#EAE6F5",
                      backgroundColor: rule === "" ? "#FAF9FC" : "#fff",
                      color: "#3C3552",
                    }}
                  >
                    <input type="radio" name="rule" checked={rule === ""} onChange={() => pickRule("", chargeId)} />
                    <span>Another reason, I will set the amount</span>
                  </label>
                  {chosen?.note && (
                    <p className="text-xs" style={{ color: "#6D6683" }} data-testid="policy-note">
                      {chosen.note}
                    </p>
                  )}
                </fieldset>
              )}

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

              {canEndPlan && (
                <label className="flex items-center gap-2 text-sm" style={{ color: "#3C3552" }}>
                  <input type="checkbox" checked={endPlan} onChange={(e) => setEndPlan(e.target.checked)} />
                  <span>Also end their plan now</span>
                </label>
              )}
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
            {done ? "Close" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!chargeId || !reason.trim() || saving || done}
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
