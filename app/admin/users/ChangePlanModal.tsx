"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PLANS, ADMIN_ASSIGNABLE_PLANS, asPlanId } from "@/app/lib/plans";

// Changing a plan means different things depending on what's behind the
// account, and getting it wrong costs real money — so the modal spells out
// which of the four paths this particular change will take before it's made.

const fieldClass =
  "w-full px-3.5 py-2.5 border rounded-xl bg-white text-sm font-medium placeholder-[#9A93AD] focus:outline-none focus:border-[#1D1730] transition-colors";
const fieldStyle = { borderColor: "#EAE6F5" };

export default function ChangePlanModal({
  userId,
  name,
  currentPlan,
  hasCustomer,
  hasSubscription,
  onClose,
  onChanged,
}: {
  userId: string;
  name: string;
  currentPlan: string;
  hasCustomer: boolean;
  hasSubscription: boolean;
  onClose: () => void;
  onChanged: (msg: string) => void;
}) {
  const options = ADMIN_ASSIGNABLE_PLANS.filter((p) => p.id !== currentPlan);
  const [plan, setPlan] = useState<string>(options[0]?.id ?? "free");
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downgrade = plan === "free";

  // Both plans by their real names. These sentences used to say "Pro"
  // unconditionally, which was wrong at both ends once Max went back on sale:
  // it described losing "Pro access" to a teacher who was on Max, and offered
  // to comp "Pro" when the admin had selected Max at twice the price.
  const targetName = PLANS[asPlanId(plan)].name;
  const currentName = PLANS[asPlanId(currentPlan)].name;

  // Mirrors the branching in /api/admin/teachers/change-plan so the admin knows
  // what they're about to do. Kept in step with that route by hand — if the
  // cases there change, change them here too.
  const consequence = downgrade
    ? hasSubscription
      ? immediate
        ? `Their Stripe subscription will be cancelled straight away and they'll lose ${currentName} access now.`
        : "Their Stripe subscription will be set to cancel at the end of the current period. They keep access until then."
      : "Their plan is removed right away and they won't be able to create anything until they subscribe. There's no Stripe subscription to cancel."
    : hasCustomer
      ? `A Stripe subscription will be created at the ${targetName} price and their card will be charged on the normal cycle.`
      : `This teacher has no card on file, so this is a COMP — they'll get ${targetName} for free until you change it back. Nothing will be billed.`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/teachers/change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, plan, reason: reason.trim(), immediate }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not change the plan.");
      setSaving(false);
      return;
    }
    onChanged(json.message ?? "Plan changed.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-1010 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
        style={{ borderColor: "#EAE6F5", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex items-start gap-3 p-5 pb-4 border-b" style={{ borderColor: "#EAE6F5" }}>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold" style={{ color: "#1D1730" }}>
              Change plan
            </h2>
            <p className="text-sm mt-0.5 truncate" style={{ color: "#6D6683" }}>
              {name} · currently {currentName}
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

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
              Move to
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className={fieldClass}
              style={fieldStyle}
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {downgrade && hasSubscription && (
            <label className="flex items-start gap-2 text-sm" style={{ color: "#3C3552" }}>
              <input
                type="checkbox"
                checked={immediate}
                onChange={(e) => setImmediate(e.target.checked)}
                className="mt-0.5"
              />
              <span>Cancel immediately instead of at the end of the period</span>
            </label>
          )}

          <div
            className="rounded-xl px-3 py-2.5 text-sm"
            style={{
              backgroundColor: !downgrade && !hasCustomer ? "#FBF3DF" : "#F7F5FC",
              color: !downgrade && !hasCustomer ? "#8A3C12" : "#3C3552",
            }}
          >
            {consequence}
          </div>

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

          {error && (
            <p className="text-sm" style={{ color: "#B3261E" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 p-5 pt-0"
          style={{ borderColor: "#EAE6F5" }}
        >
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
            disabled={!reason.trim() || saving}
            className="text-sm font-semibold rounded-xl px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: "#5B2ED6" }}
          >
            {saving ? "Working…" : "Change plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
