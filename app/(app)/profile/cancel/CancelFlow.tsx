"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  REASONS,
  asCancelReason,
  offerHeading,
  resolveStep,
  screenFor,
  stepNumber,
  gbp,
  type CancelReason,
  type CancelStep,
  type InventoryTile,
  type TimelineStep,
} from "@/app/lib/cancel-flow";
import type { BillingInterval, PlanId } from "@/app/lib/plans";
import DowngradeButton from "@/app/account/billing/DowngradeButton";
import BillingChangePanel from "@/app/account/billing/BillingChangePanel";
import ResumeButton from "@/app/account/billing/ResumeButton";

/*
 * The cancel flow's screens. Everything it shows comes from the server page as
 * props; this decides only which screen is up and sends what the teacher chose.
 *
 * Moving between screens is window.history.pushState, which Next syncs into
 * useSearchParams: no server round trip per step, a real back button, and a
 * refresh lands on the same screen. Anything that changes the subscription
 * (the discount, cancelling) uses router.replace instead, so the page is read
 * again and shows Stripe's answer rather than ours.
 *
 * THE RULE THIS FILE MUST KEEP
 * From the second screen on, "continue cancelling" is always there, enabled,
 * and one tap. It is quieter than the save buttons, which is fine, but it is
 * never hidden, disabled or behind another click (data-testid
 * "continue-cancelling", pinned by tests/billing/cancel-flow.spec.ts).
 */

interface Offer {
  interval: BillingInterval;
  title: string;
  line: string;
  savedPence: number;
  /** Set when they have cancelled and the offer is still held open. */
  heldUntil: string | null;
}

interface Props {
  initialStep: CancelStep;
  initialReason: CancelReason | null;
  plan: PlanId;
  planName: string;
  interval: BillingInterval;
  trialing: boolean;
  ending: boolean;
  renews: string | null;
  offer: Offer | null;
  activeOffer: { line: string; endsAt: string | null } | null;
  canDowngrade: boolean;
  canSwitchAnnual: boolean;
  tiles: InventoryTile[];
  losses: string[];
  timeline: TimelineStep[];
  kept: string | null;
}

type Kept = "discount" | "downgrade" | "switch_annual" | "kept";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; reference?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reference?: string };
    return { ok: res.ok && Boolean(data.ok), error: data.error, reference: data.reference };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

const card = "rounded-2xl border p-5 sm:p-6";
const cardStyle = { backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" } as const;
const primary =
  "inline-flex items-center justify-center py-3 px-6 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer";
const primaryStyle = { backgroundColor: "var(--j-purple)", color: "#fff" } as const;
const secondary =
  "inline-flex items-center justify-center py-3 px-6 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer";
const secondaryStyle = {
  backgroundColor: "transparent",
  color: "var(--j-body)",
  border: "1px solid var(--j-line-2)",
} as const;

export default function CancelFlow(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the state. The server already resolved the first screen; this
  // resolves again on every history change with the same rules.
  const reason = asCancelReason(searchParams.get("reason")) ?? props.initialReason;
  const step = searchParams.has("step")
    ? resolveStep(searchParams.get("step"), reason, props.ending)
    : props.initialStep;
  const kept = (searchParams.get("kept") ?? props.kept) as Kept | null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(next: CancelStep, nextReason: CancelReason | null = reason) {
    setError(null);
    const params = new URLSearchParams();
    params.set("step", next);
    if (nextReason) params.set("reason", nextReason);
    window.history.pushState(null, "", `?${params.toString()}`);
    window.scrollTo({ top: 0 });
  }

  /** After something changed in Stripe: read the page again. */
  function land(next: CancelStep, keptKind?: Kept) {
    const params = new URLSearchParams();
    params.set("step", next);
    if (reason) params.set("reason", reason);
    if (keptKind) params.set("kept", keptKind);
    router.replace(`/profile/cancel?${params.toString()}`);
    router.refresh();
  }

  async function record(outcome: string, detail?: string) {
    return post("/api/billing/cancel-flow/outcome", { reason, outcome, detail });
  }

  async function keep(outcome: "kept_offer" | "kept_inventory" | "kept_confirm") {
    setBusy(true);
    // Keeping changes nothing, so a failed record is not the teacher's
    // problem: they still land on the saved screen.
    await record(outcome);
    setBusy(false);
    go("saved");
  }

  async function acceptOffer() {
    setBusy(true);
    setError(null);
    const res = await post("/api/billing/cancel-flow/offer", { reason });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not apply the offer.");
      return;
    }
    land("saved", "discount");
  }

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    const res = await post("/api/billing/cancel-flow/cancel", { reason });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not cancel.");
      return;
    }
    land("done");
  }

  const number = stepNumber(step);

  return (
    <div className="max-w-2xl" data-testid="cancel-flow" data-step={step}>
      {number !== null && (
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--j-faint)" }}>
          Step {number} of 4
        </p>
      )}

      {step === "reason" && (
        <ReasonStep
          initial={reason}
          onContinue={(r) => go(screenFor(r), r)}
          planName={props.planName}
        />
      )}

      {step === "offer" && reason && (
        <OfferStep
          {...props}
          reason={reason}
          busy={busy}
          onAccept={acceptOffer}
          onKeep={() => keep("kept_offer")}
          onSaved={async (k) => {
            await record(k);
            land("saved", k);
          }}
          onForward={() => go("lose")}
        />
      )}

      {step === "fix" && reason && (
        <FixStep
          reason={reason}
          busy={busy}
          onSend={async (message) => {
            setBusy(true);
            setError(null);
            const res = await record("support_message", message);
            setBusy(false);
            if (!res.ok) {
              setError(res.error ?? "Could not send that.");
              return null;
            }
            return res.reference ?? "";
          }}
          onKeep={() => keep("kept_offer")}
          onForward={() => go("lose")}
        />
      )}

      {step === "schools" && (
        <SchoolsStep
          onIntroduce={async () => {
            await record("schools_contact");
            router.push("/contact?type=school");
          }}
          onForward={() => go("lose")}
        />
      )}

      {step === "lose" && (
        <LoseStep
          tiles={props.tiles}
          losses={props.losses}
          timeline={props.timeline}
          busy={busy}
          onKeep={() => keep("kept_inventory")}
          onForward={() => go("confirm")}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          planName={props.planName}
          renews={props.renews}
          trialing={props.trialing}
          resources={props.tiles.find((t) => t.id === "resources")?.figure ?? null}
          offerHeld={Boolean(props.offer)}
          busy={busy}
          onKeep={() => keep("kept_confirm")}
          onCancel={confirmCancel}
        />
      )}

      {step === "done" && (
        <DoneStep
          planName={props.planName}
          renews={props.renews}
          offer={props.offer}
          busy={busy}
          onAccept={acceptOffer}
        />
      )}

      {step === "saved" && (
        <SavedStep kept={kept} planName={props.planName} activeOffer={props.activeOffer} />
      )}

      {error && (
        <p role="alert" className="text-sm mt-4" style={{ color: "#c2342b" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Heading({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "var(--j-ink)" }}>
        {title}
      </h1>
      {lede && (
        <p className="mt-2 text-base" style={{ color: "var(--j-body)" }}>
          {lede}
        </p>
      )}
    </div>
  );
}

/** The way out. Present on every screen from step 2, never disabled. */
function Forward({ onClick, label = "No thanks, continue cancelling" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="continue-cancelling"
      className="text-sm font-semibold underline transition-opacity hover:opacity-70 cursor-pointer mt-6 block"
      style={{ color: "var(--j-body)", background: "none", border: 0, padding: 0 }}
    >
      {label}
    </button>
  );
}

function ReasonStep({
  initial,
  onContinue,
  planName,
}: {
  initial: CancelReason | null;
  onContinue: (r: CancelReason) => void;
  planName: string;
}) {
  const [picked, setPicked] = useState<CancelReason | null>(initial);
  return (
    <>
      <Heading
        title="Why are you thinking of cancelling?"
        lede={`One tap. It tells us what to fix, and it means we only show you what might help. You can cancel ${planName} at the end of this.`}
      />
      <fieldset>
        <legend className="sr-only">Your reason</legend>
        <div className="grid gap-2">
          {REASONS.map((r) => {
            const on = picked === r.id;
            return (
              <label
                key={r.id}
                className="flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer text-sm font-medium"
                style={{
                  backgroundColor: on ? "var(--j-tint)" : "var(--j-card)",
                  borderColor: on ? "var(--j-purple)" : "var(--j-line)",
                  color: "var(--j-ink)",
                }}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r.id}
                  checked={on}
                  onChange={() => setPicked(r.id)}
                  className="accent-[var(--j-purple)]"
                />
                {r.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-6">
        <button
          type="button"
          disabled={!picked}
          onClick={() => picked && onContinue(picked)}
          className={primary}
          style={primaryStyle}
        >
          Continue
        </button>
      </div>
    </>
  );
}

function OfferStep({
  reason,
  plan,
  interval,
  offer,
  canDowngrade,
  canSwitchAnnual,
  busy,
  onAccept,
  onKeep,
  onSaved,
  onForward,
}: Props & {
  reason: CancelReason;
  busy: boolean;
  onAccept: () => void;
  onKeep: () => void;
  onSaved: (k: "downgrade" | "switch_annual") => void;
  onForward: () => void;
}) {
  const [panel, setPanel] = useState<"downgrade" | "annual" | null>(null);
  return (
    <>
      <Heading
        title={offerHeading(reason)}
        lede={
          offer
            ? "Take the offer and nothing else changes. It is applied straight away."
            : "Here are the ways to keep Jooma for less."
        }
      />

      {offer && (
        <div className={card} style={cardStyle} data-testid="retention-offer">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--j-orange)" }}>
            Our offer
          </p>
          <p className="text-xl font-bold mt-1" style={{ color: "var(--j-ink)" }}>
            {offer.title}
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--j-body)" }}>
            {offer.line}. You save {gbp(offer.savedPence)}.
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--j-faint)" }}>
            Once per account every 12 months. Then your usual price carries on, and you can still
            cancel at any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={onAccept} className={primary} style={primaryStyle}>
              {busy ? "Applying…" : "Accept the offer"}
            </button>
          </div>
        </div>
      )}

      {(canDowngrade || canSwitchAnnual) && (
        <div className={`${card} mt-4`} style={cardStyle}>
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--j-ink)" }}>
            Or change your plan
          </p>
          {panel === "downgrade" ? (
            <DowngradeButton
              from={plan}
              to="standard"
              interval={interval}
              onClose={() => setPanel(null)}
              onDone={() => onSaved("downgrade")}
            />
          ) : panel === "annual" ? (
            <BillingChangePanel
              fromPlan={plan}
              toPlan={plan}
              to="year"
              onClose={() => setPanel(null)}
              onDone={() => onSaved("switch_annual")}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {canDowngrade && (
                <button type="button" onClick={() => setPanel("downgrade")} className={secondary} style={secondaryStyle}>
                  Move to Standard
                </button>
              )}
              {canSwitchAnnual && (
                <button type="button" onClick={() => setPanel("annual")} className={secondary} style={secondaryStyle}>
                  Pay yearly instead
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <button type="button" disabled={busy} onClick={onKeep} className={secondary} style={secondaryStyle}>
          Keep my plan as it is
        </button>
      </div>
      <Forward onClick={onForward} />
    </>
  );
}

function FixStep({
  reason,
  busy,
  onSend,
  onKeep,
  onForward,
}: {
  reason: CancelReason;
  busy: boolean;
  onSend: (message: string) => Promise<string | null>;
  onKeep: () => void;
  onForward: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      <Heading
        title={reason === "missing" ? "What's missing?" : "What went wrong?"}
        lede="Tell us and it goes straight to the team who build Jooma. We read every one, and we reply."
      />
      {sent !== null ? (
        <div className={card} style={cardStyle} role="status" data-testid="support-sent">
          <p className="font-semibold" style={{ color: "var(--j-ink)" }}>
            Thank you. We have it{sent ? `, reference ${sent}` : ""}.
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--j-body)" }}>
            We will reply by email. You can keep your plan while we look, or carry on cancelling.
          </p>
        </div>
      ) : (
        <div className={card} style={cardStyle}>
          <label htmlFor="cancel-detail" className="text-sm font-semibold" style={{ color: "var(--j-ink)" }}>
            Your message
          </label>
          <textarea
            id="cancel-detail"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={5}
            className="mt-2 w-full rounded-xl border p-3 text-sm"
            style={{ borderColor: "var(--j-line-2)", backgroundColor: "var(--j-card)", color: "var(--j-ink)" }}
          />
          <button
            type="button"
            disabled={busy || message.trim().length === 0}
            onClick={async () => {
              const ref = await onSend(message.trim());
              if (ref !== null) setSent(ref);
            }}
            className={`${primary} mt-3`}
            style={primaryStyle}
          >
            {busy ? "Sending…" : "Send to the team"}
          </button>
        </div>
      )}
      <div className="mt-6">
        <button type="button" disabled={busy} onClick={onKeep} className={secondary} style={secondaryStyle}>
          Keep my plan
        </button>
      </div>
      <Forward onClick={onForward} />
    </>
  );
}

function SchoolsStep({ onIntroduce, onForward }: { onIntroduce: () => void; onForward: () => void }) {
  return (
    <>
      <Heading
        title="Your school can have Jooma for everyone."
        lede="A school licence covers every teacher, with central billing. Tell the schools team about your school and they will take it from there, so you are not paying twice."
      />
      <div className={card} style={cardStyle}>
        <button type="button" onClick={onIntroduce} className={primary} style={primaryStyle}>
          Introduce me to the schools team
        </button>
      </div>
      <Forward onClick={onForward} />
    </>
  );
}

function LoseStep({
  tiles,
  losses,
  timeline,
  busy,
  onKeep,
  onForward,
}: {
  tiles: InventoryTile[];
  losses: string[];
  timeline: TimelineStep[];
  busy: boolean;
  onKeep: () => void;
  onForward: () => void;
}) {
  return (
    <>
      <Heading
        title="Here is what you have built."
        lede="This is exactly what happens to it if you cancel, so nothing is a surprise later."
      />

      {tiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="inventory">
          {tiles.map((t) => (
            <div key={t.id} className="rounded-xl border p-4" style={cardStyle} data-tile={t.id}>
              <p className="text-lg font-bold" style={{ color: "var(--j-ink)" }}>
                {t.figure}
              </p>
              <p className="text-sm" style={{ color: "var(--j-body)" }}>
                {t.label}
              </p>
              <p
                className="text-sm font-semibold mt-2"
                style={{ color: t.tone === "kept" ? "#1f6b3b" : "var(--j-orange)" }}
              >
                {t.fate}
              </p>
            </div>
          ))}
        </div>
      )}

      {losses.length > 0 && (
        <ul className="mt-4 text-sm space-y-1" style={{ color: "var(--j-body)" }}>
          {losses.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden="true" style={{ color: "var(--j-orange)" }}>
                &times;
              </span>
              {l}
            </li>
          ))}
        </ul>
      )}

      <div className={`${card} mt-5`} style={cardStyle}>
        <h2 className="font-bold" style={{ color: "var(--j-ink)" }}>
          What happens, and when
        </h2>
        <ol className="mt-3 space-y-3">
          {timeline.map((t) => (
            <li key={t.when} className="text-sm">
              <span className="font-semibold block" style={{ color: "var(--j-ink)" }}>
                {t.when}
              </span>
              <span style={{ color: t.tone === "kept" ? "#1f6b3b" : "var(--j-body)" }}>{t.what}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onKeep} className={primary} style={primaryStyle}>
          Keep my plan
        </button>
        <button
          type="button"
          onClick={onForward}
          data-testid="continue-cancelling"
          className={secondary}
          style={secondaryStyle}
        >
          Continue cancelling
        </button>
      </div>
    </>
  );
}

function ConfirmStep({
  planName,
  renews,
  trialing,
  resources,
  offerHeld,
  busy,
  onKeep,
  onCancel,
}: {
  planName: string;
  renews: string | null;
  trialing: boolean;
  resources: string | null;
  offerHeld: boolean;
  busy: boolean;
  onKeep: () => void;
  onCancel: () => void;
}) {
  const until = renews ?? "the end of your billing period";
  return (
    <>
      <Heading
        title={`Cancel ${planName}?`}
        lede={
          trialing
            ? `You won't be charged. You keep ${planName} until your free trial ends on ${until}.`
            : `You won't be charged again. You keep ${planName} until ${until}, the end of the period you have paid for.`
        }
      />
      <div className={card} style={cardStyle}>
        <ul className="space-y-3 text-sm" style={{ color: "var(--j-body)" }}>
          <li>
            <span className="font-semibold block" style={{ color: "var(--j-ink)" }}>
              Access until {until}
            </span>
            Everything on {planName}, as now.
          </li>
          <li>
            <span className="font-semibold block" style={{ color: "var(--j-ink)" }}>
              No further charges
            </span>
            {trialing ? "Your first payment will not be taken." : "Your next payment will not be taken."}
          </li>
          <li>
            <span className="font-semibold block" style={{ color: "var(--j-ink)" }}>
              Nothing deleted
            </span>
            {resources === "1"
              ? "The resource you made stays exactly where it is."
              : resources
              ? `All ${resources} of your resources stay exactly where they are.`
              : "Your library stays exactly where it is."}
          </li>
        </ul>
        {offerHeld && (
          <p className="text-sm mt-4" style={{ color: "var(--j-body)" }}>
            Our offer stays open for 14 days after you cancel, if you change your mind.
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onKeep} className={primary} style={primaryStyle}>
          Keep my plan
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={secondary}
          style={secondaryStyle}
          data-testid="confirm-cancel"
        >
          {busy ? "Cancelling…" : "Yes, cancel my plan"}
        </button>
      </div>
    </>
  );
}

function DoneStep({
  planName,
  renews,
  offer,
  busy,
  onAccept,
}: {
  planName: string;
  renews: string | null;
  offer: Offer | null;
  busy: boolean;
  onAccept: () => void;
}) {
  return (
    <>
      <Heading
        title="Your plan is cancelled."
        lede={`No further charges. You have ${planName} until ${renews ?? "the end of your billing period"}, so use the rest of it.`}
      />
      <div className={card} style={cardStyle}>
        <p className="text-sm" style={{ color: "var(--j-body)" }}>
          After that you can still sign in, open everything you have made and export it. Nothing is
          deleted.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <ResumeButton />
          <Link
            href="/profile?section=subscription"
            className="text-sm font-semibold underline"
            style={{ color: "var(--j-purple)" }}
          >
            Back to my account
          </Link>
        </div>
      </div>

      {offer?.heldUntil && (
        <div className={`${card} mt-4`} style={cardStyle} data-testid="held-offer">
          <p className="font-semibold" style={{ color: "var(--j-ink)" }}>
            Changed your mind? Our offer is open until {offer.heldUntil}.
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--j-body)" }}>
            {offer.title}: {offer.line}. Taking it turns your plan back on.
          </p>
          <button type="button" disabled={busy} onClick={onAccept} className={`${primary} mt-3`} style={primaryStyle}>
            {busy ? "Applying…" : "Turn my plan back on with the offer"}
          </button>
        </div>
      )}
    </>
  );
}

function SavedStep({
  kept,
  planName,
  activeOffer,
}: {
  kept: Kept | null;
  planName: string;
  activeOffer: { line: string; endsAt: string | null } | null;
}) {
  const lede =
    kept === "discount"
      ? activeOffer
        ? `${activeOffer.line}${activeOffer.endsAt ? ` It runs until ${activeOffer.endsAt}.` : ""}`
        : "Your discount is on. You will see it on your next payment."
      : kept === "downgrade"
        ? "You move to Standard when your current period ends. Until then nothing changes."
        : kept === "switch_annual"
          ? "You are now billed yearly."
          : `${planName} carries on exactly as it was. Your library, your badges and your credits are untouched.`;
  return (
    <>
      <Heading title="That's sorted." lede={lede} />
      <div className="flex flex-wrap gap-2">
        <Link href="/create" className={primary} style={primaryStyle}>
          Make something
        </Link>
        <Link href="/profile?section=subscription" className={secondary} style={secondaryStyle}>
          Back to my account
        </Link>
      </div>
    </>
  );
}
