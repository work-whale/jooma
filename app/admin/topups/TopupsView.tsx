"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { topupEconomics } from "@/app/lib/topup-margin";
import {
  PLANS,
  PLAN_CREDITS,
  SELECTABLE_PLAN_IDS,
  asPlanId,
  toCredits,
} from "@/app/lib/plans";
import { fmtDateTime, gbp, nf } from "../format";
import { RuleRow, type PricingRule } from "../plans/PlansView";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Modal,
  Note,
  PLAN_TONE,
  PageHead,
  Stat,
  StatusTag,
  Table,
  Tag,
  Td,
  Th,
  Toggle,
  ToggleRow,
  Tr,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";

export interface TopupPack {
  id: string;
  kind: string;
  name: string;
  price_gbp: number;
  unit: number;
  available_to: string[];
  active: boolean;
  stripe_price_id: string | null;
  /** Display order, and the tie-breaker for the default pack. */
  sort: number;
  sold: number;
  revenue_gbp: number;
}

export interface TopupSummary {
  sold_total: number;
  sold_this_month: number;
  revenue_total: number;
  revenue_this_month: number;
  ai_packs: number;
  repeat_buyers: number;
}

export interface RecentTopup {
  id: string;
  user_id: string;
  email: string | null;
  pack_name: string;
  kind: string;
  units: number;
  price_gbp: number;
  status: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export default function TopupsView({
  packs,
  summary,
  rules,
  recent,
}: {
  packs: TopupPack[];
  summary: TopupSummary | null;
  rules: PricingRule[];
  recent: RecentTopup[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TopupPack | null>(null);
  const [creating, setCreating] = useState(false);
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
        title="Top-ups"
        sub="What a teacher can buy when they run out mid-month. Creating or re-pricing a pack updates Stripe."
      >
        <Btn variant="primary" onClick={() => setCreating(true)}>
          + New pack
        </Btn>
      </PageHead>

      <div className="grid gap-3.5 mb-6 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Top-ups sold"
          value={nf.format(Number(summary?.sold_total ?? 0))}
          foot={`${nf.format(Number(summary?.sold_this_month ?? 0))} this month`}
        />
        <Stat
          label="Top-up revenue"
          value={gbp(Number(summary?.revenue_total ?? 0))}
          foot={`${gbp(Number(summary?.revenue_this_month ?? 0))} this month`}
        />
        <Stat
          label="AI image packs"
          value={nf.format(Number(summary?.ai_packs ?? 0))}
          foot="of all packs sold"
        />
        <Stat
          label="Repeat buyers"
          value={nf.format(Number(summary?.repeat_buyers ?? 0))}
          foot="bought more than once"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Packs</CardTitle>
        </CardHeader>
        {packs.length === 0 ? (
          <EmptyState title="No packs configured" />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Pack</Th>
                <Th>Pool</Th>
                <Th align="right">Price</Th>
                <Th align="right">Costs us</Th>
                <Th align="right">Margin</Th>
                <Th align="right">Sold</Th>
                <Th>Available to</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => {
                const price = Number(p.price_gbp);
                const { cost, margin } = topupEconomics(p.kind, Number(p.unit), price);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <span className="font-semibold" style={{ color: C.ink }}>
                        {p.name}
                      </span>
                      {!p.active && (
                        <span className="ml-2">
                          <Tag>Inactive</Tag>
                        </span>
                      )}
                      {/* An active pack with no Stripe price cannot be sold —
                          checkout would fail at the moment of payment. */}
                      {p.active && !p.stripe_price_id && (
                        <span className="ml-2">
                          <Tag tone="warn">No Stripe price</Tag>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Tag
                        tone={
                          p.kind === "ai_image" ? "img" : p.kind === "credit_gbp" ? "brand" : "ai"
                        }
                        dot
                      >
                        {p.kind === "ai_image"
                          ? "AI images"
                          : p.kind === "credit_gbp"
                            ? "AI credit"
                            : "Resources"}
                      </Tag>
                    </Td>
                    <Td align="right" mono>
                      {gbp(price)}
                    </Td>
                    <Td align="right">
                      <span className="tabular-nums" style={{ color: C.ink2 }}>
                        {cost == null ? "—" : gbp(cost)}
                      </span>
                    </Td>
                    <Td align="right">
                      {margin == null ? (
                        <span className="text-xs" style={{ color: C.muted }}>
                          —
                        </span>
                      ) : (
                        <Tag tone={margin < 0 ? "danger" : margin < 0.35 ? "warn" : "ok"}>
                          {Math.round(margin * 100)}%
                        </Tag>
                      )}
                    </Td>
                    <Td align="right" mono>
                      {nf.format(Number(p.sold))}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {p.available_to.map((plan) => (
                          <Tag key={plan} tone={PLAN_TONE[plan] ?? "plain"}>
                            {plan}
                          </Tag>
                        ))}
                      </div>
                    </Td>
                    <Td align="right">
                      <Btn size="sm" onClick={() => setEditing(p)}>
                        Edit
                      </Btn>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <CardFooter>
          The top-up sells {nf.format(PLAN_CREDITS)} credits for £1.50 — internally that is
          £1.50 of model spend, so it has no margin to report. It exists to stop heavy users
          hitting a wall mid-lesson, not to make money. Teachers see <b>credits</b>, never the
          pound figure. A pack needs a Stripe price before checkout can charge for it.
          <br />
          &quot;Costs us&quot; for a resource pack is the most it can cost: every resource used, at
          0.15p each, plus Stripe&apos;s card fee (1.5% + 20p).
        </CardFooter>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent top-ups</CardTitle>
        </CardHeader>
        {recent.length === 0 ? (
          <EmptyState title="No top-ups yet" />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>When</Th>
                <Th>Teacher</Th>
                <Th>Bought</Th>
                <Th align="right">Paid</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="tabular-nums" style={{ color: C.ink2 }}>
                      {fmtDateTime(r.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: C.ink }}>{r.email ?? "Deleted account"}</span>
                  </Td>
                  <Td>{r.pack_name}</Td>
                  <Td align="right" mono>
                    {gbp(Number(r.price_gbp))}
                  </Td>
                  <Td>
                    <StatusTag status={r.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardFooter>
          Every completed purchase, whether or not it maps to a pack. Refunds are mirrored from
          Stripe, so a refunded top-up shows here rather than silently disappearing.
        </CardFooter>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Rules</CardTitle>
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
      </Card>

      {(editing || creating) && (
        <EditPackModal
          pack={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
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
 * Create or edit a pack. Saving goes through /api/admin/topups/pack rather than
 * straight to the RPC, because a price change has to create a new Stripe Price
 * first — Price objects are immutable, and a pack whose stored price disagrees
 * with Stripe would charge the wrong amount at checkout.
 */
function EditPackModal({
  pack,
  onClose,
  onSaved,
}: {
  /** Null when creating a new pack. */
  pack: TopupPack | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = pack === null;
  const [kind, setKind] = useState(pack?.kind ?? "credit_gbp");
  const [name, setName] = useState(pack?.name ?? "");
  const [price, setPrice] = useState(pack ? String(pack.price_gbp) : "1.50");
  const [unit, setUnit] = useState(pack ? String(pack.unit) : "150");
  const [active, setActive] = useState(pack?.active ?? true);
  // Which plans may buy this. NOT enforced by RLS — /api/stripe/topup re-checks
  // it — but it is what the top-up modal offers, so an empty list means nobody
  // can buy the pack.
  const [availableTo, setAvailableTo] = useState<string[]>(
    pack?.available_to ?? SELECTABLE_PLAN_IDS,
  );
  // Display order, and the tie-breaker for which pack a caller that names none
  // gets. Blank on a new pack means "append to the end", which the RPC works out.
  const [sort, setSort] = useState(pack ? String(pack.sort) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredit = kind === "credit_gbp";

  // A credit pack grants exactly what it costs, so the two fields are one
  // number. Keeping them in lockstep here means the server-side check that they
  // agree can never fire from ordinary use.
  const setPriceSynced = (next: string) => {
    setPrice(next);
    if (isCredit) {
      const pence = Math.round(Number(next) * 100);
      if (Number.isFinite(pence) && pence > 0) setUnit(String(pence));
    }
  };

  const { cost, margin } = topupEconomics(kind, Number(unit), Number(price));

  const priceChanged = !pack || Number(pack.price_gbp) !== Number(price);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/topups/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pack?.id,
          kind,
          name,
          priceGbp: Number(price),
          unit: Number(unit),
          active,
          availableTo,
          // Omitted rather than sent as 0 when blank, so the RPC's "append to
          // the end" default applies instead of putting every new pack first.
          ...(sort.trim() === "" ? {} : { sort: Number(sort) }),
        }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(json.error ?? "Could not save the pack.");
        return;
      }
      onSaved(
        priceChanged ? `${name} saved — price live in Stripe.` : `${name} saved.`,
      );
      onClose();
    } catch {
      setSaving(false);
      setError("Could not reach the server.");
    }
  };

  return (
    <Modal
      title={isNew ? "New top-up pack" : `Edit ${pack.name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save pack"}
          </Btn>
        </>
      }
    >
      {isNew && (
        <Field
          label="Pool"
          help="Only AI credit has a live purchase path — the other pools aren't sellable yet."
        >
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            <option value="credit_gbp">AI credit (£ of model spend)</option>
            <option value="resource">Resources</option>
            <option value="ai_image">AI-image slideshows</option>
          </select>
        </Field>
      )}

      <Field label="Pack name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Price (£)" help="Saving creates a new one-off price in Stripe.">
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPriceSynced(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
        <Field
          label={
            isCredit ? "Credit granted (pence)" : kind === "ai_image" ? "AI slideshows" : "Resources"
          }
          help={
            isCredit
              ? `Always matches the price. Teachers see this as ${nf.format(
                  toCredits(Number(unit) || 0),
                )} credits, never as pence.`
              : undefined
          }
        >
          <input
            type="number"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={isCredit}
            className={fieldClass}
            style={{ ...fieldStyle, opacity: isCredit ? 0.6 : 1 }}
          />
        </Field>
      </div>

      {/* Who may buy it, and in what order it appears. Both only matter once
          there is more than one pack — but both were previously impossible to
          change after creation, because admin_upsert_topup_pack dropped them
          from its UPDATE. */}
      <Field
        label="Available to"
        help="Which plans are offered this pack. Unticking every plan hides it from everyone."
      >
        <div className="flex flex-wrap gap-2">
          {SELECTABLE_PLAN_IDS.map((planId) => {
            const on = availableTo.includes(planId);
            return (
              <button
                key={planId}
                type="button"
                onClick={() =>
                  setAvailableTo((prev) =>
                    on ? prev.filter((p) => p !== planId) : [...prev, planId],
                  )
                }
                className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition-colors"
                style={{
                  backgroundColor: on ? C.brandBg : C.white,
                  borderColor: on ? C.brand : C.border,
                  color: on ? C.brand : C.muted,
                }}
              >
                {PLANS[asPlanId(planId)].name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="Order"
        help="Lowest first in the top-up list, and the default when no pack is chosen. Leave blank to add at the end."
      >
        <input
          type="number"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          placeholder={isNew ? "Last" : undefined}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>

      {/* Credit packs have no margin to model: a £1.50 credit buys £1.50 of
          spend by definition, so the cost sheet has nothing to say about it. */}
      {cost != null && margin != null && (
        <div
          className="rounded-xl border px-3.5 py-3 text-sm"
          style={{ borderColor: C.border, backgroundColor: C.white }}
        >
          <div className="flex justify-between mb-1">
            <span style={{ color: C.muted }}>Costs us to fulfil</span>
            <span className="tabular-nums" style={{ color: C.ink }}>
              {gbp(cost)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Margin</span>
            <span
              className="tabular-nums font-semibold"
              style={{ color: margin < 0 ? C.danger : margin < 0.35 ? C.warn : C.ok }}
            >
              {Math.round(margin * 100)}%
            </span>
          </div>
        </div>
      )}

      <div className="mt-3">
        <ToggleRow title="Active" desc="Inactive packs are hidden from teachers.">
          <Toggle on={active} onChange={setActive} label="Active" />
        </ToggleRow>
      </div>

      {priceChanged && !isNew && (
        <div className="mt-3">
          <Note tone="warn">
            Stripe prices can&apos;t be edited, so saving creates a new one and archives the
            old. Anyone part-way through checkout on the old price still pays the old amount.
          </Note>
        </div>
      )}

      {error && (
        <p className="text-sm mt-2" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
