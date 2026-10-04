"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { COST, ONBOARD_FEE, SEAT_BANDS, marginTone, worstCase } from "@/app/lib/costs";
import {
  AI_SPEND_CEILING_PENCE,
  PLAN_CREDITS,
  PRICEABLE_PLAN_IDS,
  toCredits,
  type PlanId,
} from "@/app/lib/plans";
// From fx-shared, not fx: this is a client component and fx.ts is server-only.
import { FX_REVIEW_AFTER_DAYS, type FxRate } from "@/app/lib/fx-shared";
import { FX_USD_TO_GBP, gbp, nf, pence } from "../format";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Modal,
  Note,
  PageHead,
  StatusTag,
  Table,
  Td,
  Th,
  Toggle,
  ToggleRow,
  Tr,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";

export interface PlanRow {
  plan_id: string;
  name: string;
  audience: string;
  price_monthly: number | null;
  price_yearly: number | null;
  monthly_resources: number | null;
  ai_image_slideshows: number;
  description: string | null;
  status: string;
  stripe_price_monthly: string | null;
  users: number;
}

export interface PricingRule {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  /** True when nothing in the codebase reads this rule. Rendered disabled. */
  not_implemented: boolean;
  sort: number;
}

/** Plans sold through Stripe Checkout, and therefore able to have a real price
 *  changed from here. Free has nothing to charge; School isn't built.
 *
 *  Imported rather than redeclared: this screen and /api/admin/plans/price must
 *  agree on which plans are priceable, and when the list lived in both places
 *  they drifted — the screen went on offering "display only" for Max after Max
 *  was back on sale. */
const PRICEABLE = new Set<string>(PRICEABLE_PLAN_IDS);

export default function PlansView({
  plans,
  rules,
  fx,
}: {
  plans: PlanRow[];
  rules: PricingRule[];
  fx: FxRate;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [toastNode, fire] = useToast();

  const toggleRule = async (key: string, enabled: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_pricing_rule", {
      p_key: key,
      p_enabled: enabled,
    });
    if (error) {
      fire(error.message);
      return;
    }
    router.refresh();
  };

  return (
    <>
      <PageHead
        title="Plans & pricing"
        sub="What each plan costs, what it includes, and what it leaves you. Changing Pro's monthly price updates Stripe."
      />

      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const price = Number(p.price_monthly ?? 0);

          // The enforced monthly AI-spend ceiling, in pence. This — not the
          // resource count — is what actually stops a Pro teacher, so the card
          // has to show it. Hardcoded in TypeScript rather than plan_config, so
          // it can't be edited from here; see AI_SPEND_CEILING_PENCE.
          const ceiling = AI_SPEND_CEILING_PENCE[p.plan_id as PlanId] ?? null;

          // "If a teacher used everything they're allowed to, what's left?"
          // The ceiling is passed in because it, not the allowance, is what
          // binds on a paid plan — without it Pro models at £6.00 of AI, which
          // the gate makes unreachable.
          const wc = worstCase({
            priceMonthly: price,
            // Plans with no resource cap have no allowance to model against;
            // use the school per-seat pool or a nominal heavy-use figure. On a
            // plan with a ceiling this is only the upper bound of the two.
            monthlyResources: p.monthly_resources ?? 300,
            aiImageSlideshows: p.ai_image_slideshows,
            cardFees: p.audience !== "school",
            chargeOverheads: p.plan_id !== "free",
            spendCeilingPence: ceiling,
          });

          // School is not a shippable plan yet: seats, pooled allowances and
          // central billing are unimplemented, there is no Stripe price, and
          // nothing reads plan_config.school at runtime. Greyed out and
          // non-editable so it can't be mistaken for part of the live product
          // or edited into a false sense of being configured.
          const notShipped = p.plan_id === "school";

          return (
            <Card key={p.plan_id}>
              <div
                style={{
                  opacity: notShipped ? 0.55 : 1,
                  filter: notShipped ? "grayscale(1)" : undefined,
                  pointerEvents: notShipped ? "none" : undefined,
                }}
                aria-disabled={notShipped || undefined}
              >
              <CardHeader>
                <div className="flex-1">
                  <CardTitle>
                    {p.name}
                    {/* Not sellable yet — seats, pooled allowances and central
                        billing are unimplemented, so nothing here is enforced
                        at runtime. Editable so the numbers can be modelled. */}
                    {notShipped && (
                      <span
                        className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full align-middle"
                        // Deliberately high-contrast: the card around it is
                        // greyscaled, so a pale badge would disappear.
                        style={{ backgroundColor: "#1D1730", color: "#fff" }}
                      >
                        NOT BUILT YET
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs" style={{ color: C.muted }}>
                    {p.audience === "school" ? "Schools" : "Teachers"}
                  </p>
                </div>
                <StatusTag status={p.status} />
              </CardHeader>
              <CardBody>
                <div className="tabular-nums" style={{ color: C.ink }}>
                  <span className="text-2xl font-bold">{price ? gbp(price) : "£0"}</span>
                  <span className="text-xs" style={{ color: C.muted }}>
                    {" "}
                    / {p.audience === "school" ? "seat/month" : "month"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                  {p.price_yearly
                    ? `${gbp(Number(p.price_yearly))} ${p.audience === "school" ? "per seat per year" : "a year"}`
                    : price
                      ? "Monthly only"
                      : "Not sold"}
                </p>
                <p className="text-xs mt-2" style={{ color: C.ink2 }}>
                  {p.description}
                </p>

                {/* Whether this plan is actually chargeable. A priceable plan
                    with no Stripe price would take payment nowhere, so say so
                    rather than showing a figure that can't be collected. */}
                {PRICEABLE.has(p.plan_id) && (
                  <p className="text-xs mt-2 tabular-nums" style={{ color: C.muted }}>
                    {p.stripe_price_monthly ? (
                      <>
                        Stripe price{" "}
                        <span style={{ color: C.ink2 }}>{p.stripe_price_monthly}</span>
                      </>
                    ) : (
                      <span style={{ color: C.warn }}>No Stripe price set</span>
                    )}
                  </p>
                )}

                <div className="h-px my-3" style={{ backgroundColor: C.divider }} />

                {[
                  [
                    "Resources / month",
                    // A plan with no COUNT cap is not unlimited if a spend
                    // ceiling stops it — Pro has no generation limit but halts
                    // at £1.50 of AI spend, which is a real, reachable wall.
                    // Saying "Unlimited" here is how support ends up telling a
                    // teacher something untrue.
                    p.monthly_resources === null
                      ? ceiling != null
                        ? "No set limit*"
                        : "Unlimited"
                      : nf.format(p.monthly_resources),
                    C.ink,
                  ],
                  [
                    "AI-image slideshows",
                    p.ai_image_slideshows ? nf.format(p.ai_image_slideshows) : "—",
                    C.img,
                  ],
                  ["On this plan", nf.format(Number(p.users)), C.ink],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex justify-between mb-1.5">
                    <span className="text-xs" style={{ color: C.muted }}>
                      {label}
                    </span>
                    <b className="text-xs tabular-nums" style={{ color: color as string }}>
                      {value}
                    </b>
                  </div>
                ))}

                {/* The actual stopping condition on this plan. Enforced in
                    my_generation_gate(); a teacher who hits it is blocked until
                    they top up or the month rolls over. */}
                {ceiling != null && (
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs" style={{ color: C.muted }}>
                      Hard cap*
                    </span>
                    <b className="text-xs tabular-nums" style={{ color: C.warn }}>
                      {nf.format(toCredits(ceiling))} credits
                      <span style={{ color: C.muted }}> · {gbp(ceiling / 100)}</span>
                    </b>
                  </div>
                )}

                <div className="h-px my-3" style={{ backgroundColor: C.divider }} />

                {/* Every deduction, itemised. Contribution is not price minus
                    AI cost — card fees and per-user overheads come out too, and
                    showing only the total leaves the reader to reverse-engineer
                    the difference. */}
                {price > 0 && (
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs" style={{ color: C.muted }}>
                      Price
                    </span>
                    <b className="text-xs tabular-nums" style={{ color: C.ink }}>
                      {gbp(price)}
                    </b>
                  </div>
                )}
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs" style={{ color: C.muted }}>
                    {/* Naming what does the capping: on a plan with a ceiling
                        the allowance is never the binding constraint. */}
                    {wc.cappedByCeiling ? "− Max AI cost (capped)" : "− AI if fully used"}
                  </span>
                  <b className="text-xs tabular-nums" style={{ color: C.ink }}>
                    {gbp(wc.aiCost)}
                  </b>
                </div>
                {wc.cardFee > 0 && (
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs" style={{ color: C.muted }}>
                      − Card fee
                    </span>
                    <b className="text-xs tabular-nums" style={{ color: C.ink2 }}>
                      {gbp(wc.cardFee)}
                    </b>
                  </div>
                )}
                {wc.overheads > 0 && (
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs" style={{ color: C.muted }}>
                      − Infra &amp; support
                    </span>
                    <b className="text-xs tabular-nums" style={{ color: C.ink2 }}>
                      {gbp(wc.overheads)}
                    </b>
                  </div>
                )}
                <div
                  className="flex justify-between pt-1.5"
                  style={{ borderTop: `1px solid ${C.divider}` }}
                >
                  <span className="text-xs font-semibold" style={{ color: C.ink }}>
                    Worst-case contribution
                  </span>
                  <b
                    className="text-xs tabular-nums"
                    style={{
                      color:
                        marginTone(wc.marginPct) === "danger"
                          ? C.danger
                          : marginTone(wc.marginPct) === "warn"
                            ? C.warn
                            : C.ok,
                    }}
                  >
                    {price ? (
                      <>
                        {gbp(wc.contribution)}
                        {wc.marginPct != null && (
                          <span style={{ color: C.muted }}>
                            {" "}
                            · {Math.round(wc.marginPct * 100)}%
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </b>
                </div>
              </CardBody>
              </div>
              <CardFooter>
                {notShipped ? (
                  <span className="text-xs" style={{ color: C.muted }}>
                    Not available — no pricing set
                  </span>
                ) : (
                  <Btn size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Btn>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3.5 mt-6 lg:grid-cols-2">
        {/* Modelling only. The School plan has no seat model, no pooled
            allowances and no Stripe price, so none of these bands is
            chargeable — greyed out to match the School plan card above rather
            than reading as configured pricing. */}
        <Card>
          <CardHeader>
            <CardTitle>
              School seat ladder
              <span
                className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full align-middle"
                style={{ backgroundColor: "#1D1730", color: "#fff" }}
              >
                NOT BUILT YET
              </span>
            </CardTitle>
          </CardHeader>
          <div
            style={{ opacity: 0.55, filter: "grayscale(1)", pointerEvents: "none" }}
            aria-disabled
          >
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Seats</Th>
                <Th align="right">Per seat / mo</Th>
                <Th align="right">Per seat / yr</Th>
                <Th align="right">14-seat school</Th>
                <Th align="right">40-seat school</Th>
              </tr>
            </thead>
            <tbody>
              {SEAT_BANDS.map((b) => (
                <Tr key={b.band}>
                  <Td>
                    <span className="font-semibold" style={{ color: C.ink }}>
                      {b.band}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {gbp(b.rate)}
                  </Td>
                  <Td align="right" mono>
                    {gbp(b.rate * 12)}
                  </Td>
                  <Td align="right">
                    <span className="tabular-nums" style={{ color: C.ink2 }}>
                      {b.min <= 14 && 14 <= b.max ? gbp(b.rate * 12 * 14) : "—"}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular-nums" style={{ color: C.ink2 }}>
                      {b.min <= 40 && 40 <= b.max ? gbp(b.rate * 12 * 40) : "—"}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </div>
          <CardFooter>
            Modelling only — nothing here is chargeable yet. A 14-seat school would land at
            £714 a year, deliberately under £1,000, which most heads can approve without
            governors. Plus {gbp(ONBOARD_FEE)} onboarding.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing rules</CardTitle>
          </CardHeader>
          <CardBody>
            {rules.length === 0 ? (
              <p className="text-sm" style={{ color: C.muted }}>
                No rules configured.
              </p>
            ) : (
              rules.map((r) => <RuleRow key={r.key} rule={r} onToggle={toggleRule} />)
            )}
          </CardBody>
          <CardFooter>
            Rules marked <b>not wired up</b> are stored but read by nothing — flipping one
            would change no behaviour, so the switch is disabled until the rule is
            implemented.
          </CardFooter>
        </Card>
      </div>

      <div className="mt-6 space-y-3">
        <Note tone="warn">
          <b>* Pro is not unlimited.</b> There is no cap on how many resources a teacher can
          make, but generation stops at{" "}
          <b>{nf.format(PLAN_CREDITS)} credits</b> a month — typically well over a hundred
          text resources, far fewer if they lean on AI images. At that point they can buy
          another {nf.format(PLAN_CREDITS)} for £1.50 (repeatable, expires at month end) or
          wait for the month to roll over. Say &ldquo;no set limit&rdquo;, never
          &ldquo;unlimited&rdquo;, anywhere a teacher can read it.
        </Note>
        {/* Every cost on this page is a USD provider cost converted at this
            rate. Surfaced so a stale rate is visible rather than silently
            skewing every margin figure. `drifted` catches the case the DB and
            the compiled-in fallback disagree — which would mean the enforcement
            gate and this console are using different numbers. */}
        {fx.drifted ? (
          <Note tone="danger">
            <b>FX rate mismatch.</b> The database says {fx.usdToGbp} USD→GBP but the app was
            built with {FX_USD_TO_GBP}. The spend ceiling is enforced against the database
            value, so these cost figures and the actual gate currently disagree. Align
            FX_USD_TO_GBP in <code>app/admin/format.ts</code> and redeploy.
          </Note>
        ) : fx.ageDays > FX_REVIEW_AFTER_DAYS ? (
          <Note tone="warn">
            <b>FX rate is {fx.ageDays} days old.</b> Costs convert at {fx.usdToGbp} USD→GBP,
            last checked {fx.reviewedAt}. Providers bill in USD, so drift skews every cost
            and margin here — worth a review. It never affects what a customer is charged.
          </Note>
        ) : (
          <Note>
            <b>Costs convert at {fx.usdToGbp} USD→GBP</b>, last reviewed {fx.reviewedAt}.
            Providers bill in USD; Jooma charges GBP through Stripe, so this rate affects
            these figures and the spend ceiling only, never anyone&apos;s bill.
          </Note>
        )}
        <Note>
          <b>Language check.</b> Nothing teacher-facing should say &ldquo;tokens&rdquo; — the
          words are <b>resources</b> and <b>AI-image slideshows</b>. Nor should it show the
          allowance <b>in pounds</b>: {nf.format(PLAN_CREDITS)} credits ={" "}
          {gbp(AI_SPEND_CEILING_PENCE.pro! / 100)} of model spend internally, but
          &ldquo;£1.50 of AI&rdquo; next to a £7.99 charge reads as poor value. Teachers see
          credits; this console sees both. The £1.50 top-up <i>price</i> is fine to state —
          they pay it.
        </Note>
      </div>

      {editing && (
        <EditPlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}

/**
 * One pricing rule. Rules nothing reads are shown but not operable: a switch
 * that silently changes no behaviour is worse than no switch, because it reads
 * as configuration that has been applied. Shared with the Top-ups page, which
 * renders the top-up subset of the same table.
 */
export function RuleRow({
  rule,
  onToggle,
}: {
  rule: PricingRule;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const desc = rule.description ?? undefined;

  if (rule.not_implemented) {
    return (
      <div style={{ opacity: 0.6 }}>
        <ToggleRow
          title={
            <>
              {rule.label}
              <span
                className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full align-middle"
                style={{ backgroundColor: "#F1ECFC", color: "#6D6683" }}
              >
                Not wired up
              </span>
            </>
          }
          desc={desc}
        >
          <Toggle on={rule.enabled} onChange={() => {}} label={rule.label} disabled />
        </ToggleRow>
      </div>
    );
  }

  return (
    <ToggleRow title={rule.label} desc={desc}>
      <Toggle
        on={rule.enabled}
        onChange={(next) => onToggle(rule.key, next)}
        label={rule.label}
      />
    </ToggleRow>
  );
}

function EditPlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [monthly, setMonthly] = useState(String(plan.price_monthly ?? ""));
  // Read-only: annual billing isn't sold, so this is shown but never edited.
  const [yearly] = useState(String(plan.price_yearly ?? ""));
  const [resources, setResources] = useState(String(plan.monthly_resources ?? ""));
  const [aiImages, setAiImages] = useState(String(plan.ai_image_slideshows));
  const [description, setDescription] = useState(plan.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A price change has to reach Stripe, and Stripe Price objects are immutable —
  // so the route creates a new Price and repoints at it. Everything else here is
  // presentational and goes straight to the database.
  const priceable = PRICEABLE.has(plan.plan_id);
  const priceChanged =
    priceable && monthly !== "" && Number(monthly) !== Number(plan.price_monthly ?? 0);

  const submit = async () => {
    setSaving(true);
    setError(null);

    // Stripe first: if it fails, nothing has been written, so the console never
    // ends up displaying a price that was never created.
    if (priceChanged) {
      try {
        const res = await fetch("/api/admin/plans/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.plan_id, priceMonthly: Number(monthly) }),
        });
        const json = await res.json();
        if (!res.ok) {
          setSaving(false);
          setError(json.error ?? "Could not update the price in Stripe.");
          return;
        }
      } catch {
        setSaving(false);
        setError("Could not reach Stripe.");
        return;
      }
    }

    const supabase = createClient();
    const { error: e } = await supabase.rpc("admin_update_plan", {
      p_plan_id: plan.plan_id,
      payload: {
        name,
        price_monthly: monthly === "" ? null : Number(monthly),
        price_yearly: yearly === "" ? null : Number(yearly),
        monthly_resources: resources === "" ? null : Number(resources),
        ai_image_slideshows: Number(aiImages),
        description,
      },
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    onSaved(priceChanged ? `${name} saved — new price live in Stripe.` : `${name} saved.`);
    onClose();
  };

  return (
    <Modal
      title={`Edit ${plan.name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save plan"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Plan name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
        <Field
          label="Price (£/month)"
          help={
            priceable
              ? "Saving creates a new price in Stripe and charges it from the next checkout."
              : "Display only — this plan isn't sold through Stripe."
          }
        >
          <input
            type="number"
            step="0.01"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
        {/* Annual billing does not exist: no annual Stripe price, no checkout
            path that could sell one. Disabled rather than editable so the figure
            can't be changed into looking configured. */}
        <Field
          label="Annual price (£)"
          help="Not built yet — there's no annual price in Stripe and nothing can sell one."
        >
          <input
            type="number"
            step="0.01"
            value={yearly}
            disabled
            readOnly
            className={fieldClass}
            style={{ ...fieldStyle, opacity: 0.5, cursor: "not-allowed" }}
          />
        </Field>
        <Field label="Resources / month" help="Blank means unlimited.">
          <input
            type="number"
            value={resources}
            onChange={(e) => setResources(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
      </div>

      <Field
        label="AI-image slideshows / month"
        help={
          AI_SPEND_CEILING_PENCE[plan.plan_id as PlanId] != null
            ? `Each costs about ${pence(COST.deckAI)} — roughly 33x a text resource. The ${gbp(
                AI_SPEND_CEILING_PENCE[plan.plan_id as PlanId]! / 100,
              )} spend ceiling stops them before this number does, so it's an upper bound rather than the real cost driver.`
            : `Each costs about ${pence(COST.deckAI)} — roughly 33x a text resource. With no spend ceiling on this plan, this is the number that decides whether it makes money.`
        }
      >
        <input
          type="number"
          value={aiImages}
          onChange={(e) => setAiImages(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>

      <Field label="One-line description (shows on the pricing page)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>

      {priceChanged ? (
        <Note tone="warn">
          <b>
            This changes what new customers pay, from {gbp(Number(plan.price_monthly ?? 0))} to{" "}
            {gbp(Number(monthly))}.
          </b>{" "}
          Stripe prices can&apos;t be edited, so saving creates a new one and archives the old.
          The {nf.format(Number(plan.users))} teachers already on this plan keep paying{" "}
          {gbp(Number(plan.price_monthly ?? 0))} until their subscription is migrated — Stripe
          never re-prices an existing subscriber for you.
        </Note>
      ) : (
        <Note>
          <b>{nf.format(Number(plan.users))} teachers are on this plan.</b> Everything here
          except the monthly price is display-only — it changes what the console and pricing
          page show, and nothing in Stripe.
        </Note>
      )}

      {error && (
        <p className="text-sm mt-2" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
