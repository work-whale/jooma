"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/auth/client";
import {
  CHANNELS,
  maskAccount,
  reachLabel,
  sourceLabel,
  taxLabel,
} from "@/app/lib/ambassador-application";
import { describeDiscount, yearlyEquivalentDiscount, type Discount } from "@/app/lib/ambassador-discount";
import { agreementClauses, agreementIntro } from "@/app/lib/ambassador-agreement";
import { planCardName } from "@/app/lib/plan-copy";
import { asPlanId } from "@/app/lib/plans";
import {
  Btn,
  C,
  DL,
  Disclosure,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  Row,
  Section,
  Tag,
  fieldClass,
  fieldStyle,
} from "../ui";
import { CodeChip, shortDate } from "./shared";
import styles from "./ambassadors.module.css";

/** The whole application, as admin_ambassador_application() returns it. */
export interface ApplicationDetail {
  id: string;
  user_id: string | null;
  status: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  address_line: string;
  town: string;
  postcode: string;
  school: string | null;
  teaches: string | null;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
  facebook: string | null;
  youtube: string | null;
  linkedin: string | null;
  reach: string;
  note: string | null;
  payout_method: "bank" | "paypal";
  account_holder: string;
  sort_code: string | null;
  account_number: string | null;
  bank_name: string | null;
  paypal_email: string | null;
  payout_changed_at: string | null;
  tax_status: string;
  utr: string | null;
  requested_code: string;
  agreement_version: string;
  signature_name: string;
  signed_at: string;
  signed_ip: string | null;
  signed_user_agent: string | null;
  declarations: Record<string, boolean>;
  /** Channel keys an admin has checked by hand. */
  verified_channels: string[];
  submitted_at: string;
  reviewed_at: string | null;
  decline_reason: string | null;
  invite: { full_name: string | null; source: string; created_at: string } | null;
  account: {
    email: string;
    created_at: string;
    plan: string;
    subscription_status: string | null;
    has_stripe_subscription: boolean;
  } | null;
  checks: {
    duplicate_email: boolean;
    duplicate_payout: boolean;
    code_taken: boolean;
    name_matches_account_holder: boolean;
  };
}

/** Load one application through the admin's own session (see_money only). */
export async function loadApplication(id: string): Promise<ApplicationDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_ambassador_application", { p_id: id });
  if (error) {
    console.error("[admin/ambassadors] could not load application", error);
    return null;
  }
  return data as ApplicationDetail;
}

const URLS: Record<string, string> = {
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
  x_handle: "https://x.com/",
  facebook: "https://facebook.com/",
  youtube: "https://youtube.com/@",
  linkedin: "https://linkedin.com/in/",
};

/**
 * Each channel they gave, with a link to open it and a Verify toggle for the
 * admin who has checked it by hand (the account exists, is theirs, and is
 * public). Ticking works like marking a payout paid: one click, Undo to reverse.
 * The ambassador sees Verified or Unverified against each on Payout details.
 */
export function ChannelChecks({
  app,
  onChange,
}: {
  app: ApplicationDetail;
  onChange: (verified: string[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verified = new Set(app.verified_channels ?? []);

  const set = async (channel: string, on: boolean) => {
    setBusy(channel);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id, channel, verified: on }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not update that channel.");
        return;
      }
      onChange((json.verified ?? []) as string[]);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="channel-checks">
      <DL>
        {CHANNELS.filter((ch) => app[ch.key]).map((ch) => {
          const on = verified.has(ch.key);
          return (
            <Row
              key={ch.key}
              label={ch.label}
              value={
                <span className="inline-flex items-center gap-2 flex-wrap justify-end">
                  <a
                    href={`${URLS[ch.key]}${app[ch.key]}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline"
                    style={{ color: C.brand }}
                  >
                    @{app[ch.key]}
                  </a>
                  {on ? (
                    <>
                      <Tag tone="ok" dot>
                        Verified
                      </Tag>
                      <Btn size="sm" disabled={busy !== null} onClick={() => set(ch.key, false)}>
                        Undo
                      </Btn>
                    </>
                  ) : (
                    <>
                      <Tag tone="plain">Unverified</Tag>
                      <Btn size="sm" variant="primary" disabled={busy !== null} onClick={() => set(ch.key, true)}>
                        {busy === ch.key ? "Saving…" : "Verify"}
                      </Btn>
                    </>
                  )}
                </span>
              }
            />
          );
        })}
      </DL>
      {error && (
        <p className="text-xs mt-1" role="alert" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Bank or PayPal, for reviewing or for paying them by hand. */
export function PayoutDetails({ app }: { app: ApplicationDetail }) {
  const [shown, setShown] = useState(false);
  const holderMatches = app.checks?.name_matches_account_holder;

  return (
    <DL>
      <Row label="Paid by" value={app.payout_method === "bank" ? "Bank transfer" : "PayPal"} />
      <Row label="Account holder" value={app.account_holder} />
      {app.payout_method === "bank" ? (
        <>
          <Row label="Sort code" value={<span className="font-mono">{app.sort_code}</span>} />
          <Row
            label="Account"
            value={
              <span className="inline-flex items-center gap-2">
                <span className="font-mono">
                  {shown ? app.account_number : maskAccount(app.account_number?.slice(-4))}
                </span>
                <Btn size="sm" variant="ghost" onClick={() => setShown((s) => !s)}>
                  {shown ? "Hide" : "Show"}
                </Btn>
              </span>
            }
          />
          <Row label="Bank" value={app.bank_name} />
        </>
      ) : (
        <Row label="PayPal email" value={app.paypal_email} />
      )}
      <Row
        label="Name match"
        value={
          holderMatches ? (
            <Tag tone="ok">Matches applicant</Tag>
          ) : (
            <Tag tone="warn">Different from applicant</Tag>
          )
        }
      />
      {app.payout_changed_at && (
        <Row
          label="Changed"
          value={<Tag tone="warn">Changed {shortDate(app.payout_changed_at)}, verify before paying</Tag>}
        />
      )}
    </DL>
  );
}

/**
 * Review one application: everything they gave us, the checks, and the two
 * decisions. Approving mints their code in Stripe exactly as they asked for it.
 */
export default function ReviewDrawer({
  applicationId,
  onClose,
  onDone,
}: {
  applicationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<"view" | "decline">("view");
  const [reason, setReason] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadApplication(applicationId).then((a) => {
      if (!live) return;
      if (a) setApp(a);
      else setLoadFailed(true);
    });
    return () => {
      live = false;
    };
  }, [applicationId]);

  const value = Number(discountValue);
  const discount: Discount | null =
    value > 0
      ? discountType === "percent"
        ? { percentOff: value }
        : { amountOffPence: Math.round(value * 100) }
      : null;

  const act = async (action: "approve" | "decline", close: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/applications/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "decline"
            ? { action, reason }
            : {
                action,
                ...(discountType === "percent"
                  ? { percentOff: value }
                  : { amountOffGbp: value }),
              },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return;
      }
      onDone(json.message ?? "Saved.");
      close();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const name = app ? `${app.first_name} ${app.last_name}` : "Application";
  const allDeclared = app ? Object.values(app.declarations ?? {}).filter(Boolean).length >= 3 : false;

  return (
    <Drawer onClose={onClose} width="max-w-2xl">
      {(close) => (
        <>
          <DrawerHeader
            title={name}
            sub={app?.email}
            avatar={name}
            tags={
              app && (
                <>
                  <Tag tone="brand">Awaiting review</Tag>
                  {app.invite && app.invite.source !== "other" && <Tag>Found on {sourceLabel(app.invite.source)}</Tag>}
                </>
              )
            }
            onClose={close}
          />
          <DrawerBody>
            {loadFailed ? (
              <p className="text-sm" style={{ color: C.danger }}>
                Could not load this application.
              </p>
            ) : !app ? (
              <p className="text-sm" style={{ color: C.muted }}>
                Loading…
              </p>
            ) : (
              <>
                <Section title="Personal">
                  <DL>
                    <Row label="Full name" value={name} />
                    <Row label="Email" value={app.email} />
                    <Row label="Mobile" value={app.mobile} />
                    <Row label="Date of birth" value={shortDate(app.date_of_birth)} />
                    <Row
                      label="Address"
                      value={`${app.address_line}, ${app.town} ${app.postcode}`}
                    />
                    {app.school && <Row label="School" value={app.school} />}
                    {app.teaches && <Row label="Teaches" value={app.teaches} />}
                  </DL>
                </Section>

                <Section title="Channels">
                  <ChannelChecks app={app} onChange={(verified) => setApp({ ...app, verified_channels: verified })} />
                  <DL>
                    <Row label="Stated reach" value={reachLabel(app.reach)} />
                    {app.note && <Row label="Note" value={app.note} />}
                  </DL>
                </Section>

                <Section title="Payout">
                  <PayoutDetails app={app} />
                </Section>

                <Section title="Tax">
                  <DL>
                    <Row label="Declares as" value={taxLabel(app.tax_status)} />
                    <Row label="UTR" value={app.utr ?? "Not given"} />
                  </DL>
                </Section>

                <Section title="The code they asked for">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CodeChip code={app.requested_code} />
                    {app.checks.code_taken ? (
                      <Tag tone="danger">Already taken</Tag>
                    ) : (
                      <Tag tone="ok">Free</Tag>
                    )}
                  </div>
                  <p className="text-xs mt-2" style={{ color: C.muted }}>
                    Created exactly as written when you approve, and permanent after that.
                  </p>
                </Section>

                <Section title="Agreement">
                  <DL>
                    <Row label="Signed" value={new Date(app.signed_at).toLocaleString("en-GB")} />
                    <Row
                      label="Signature"
                      value={<span className={styles.signature}>{app.signature_name}</span>}
                    />
                    <Row label="IP" value={app.signed_ip ?? "Not recorded"} />
                    <Row label="Version" value={app.agreement_version} />
                    <Row
                      label="Declarations"
                      value={
                        allDeclared ? (
                          <Tag tone="ok">All three accepted</Tag>
                        ) : (
                          <Tag tone="danger">Missing</Tag>
                        )
                      }
                    />
                  </DL>
                  <div className="mt-3">
                    <Disclosure title="Read what they signed">
                      <div className="text-sm space-y-3" style={{ color: C.ink2 }}>
                        <p>
                          {agreementIntro({
                            name,
                            address: `${app.address_line}, ${app.town} ${app.postcode}`,
                          })}
                        </p>
                        {agreementClauses({ name, code: app.requested_code }).map((c) => (
                          <div key={c.heading}>
                            <p className="font-semibold" style={{ color: C.ink }}>
                              {c.heading}
                            </p>
                            {c.paragraphs.map((p) => (
                              <p key={p}>{p}</p>
                            ))}
                            {c.bullets && (
                              <ul className="list-disc pl-5">
                                {c.bullets.map((b) => (
                                  <li key={b}>{b}</li>
                                ))}
                              </ul>
                            )}
                            {c.after?.map((p) => (
                              <p key={p}>{p}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </Disclosure>
                  </div>
                </Section>

                <Section title="Checks">
                  <DL>
                    <Row
                      label="Duplicate email"
                      value={
                        app.checks.duplicate_email ? (
                          <Tag tone="warn">Seen before</Tag>
                        ) : (
                          <Tag tone="ok">None found</Tag>
                        )
                      }
                    />
                    <Row
                      label={app.payout_method === "bank" ? "Duplicate bank" : "Duplicate PayPal"}
                      value={
                        app.checks.duplicate_payout ? (
                          <Tag tone="warn">Used by another application</Tag>
                        ) : (
                          <Tag tone="ok">None found</Tag>
                        )
                      }
                    />
                    <Row
                      label="Channels checked"
                      value={(() => {
                        const given = CHANNELS.filter((ch) => app[ch.key]).length;
                        const done = (app.verified_channels ?? []).length;
                        return (
                          <Tag tone={done === given && given > 0 ? "ok" : "warn"}>
                            {done} of {given} verified by hand
                          </Tag>
                        );
                      })()}
                    />
                    <Row
                      label="Jooma account"
                      value={
                        app.account
                          ? `${planCardName(asPlanId(app.account.plan))}, since ${shortDate(app.account.created_at)}`
                          : "Account deleted"
                      }
                    />
                  </DL>
                  {app.account?.has_stripe_subscription &&
                    ["active", "trialing", "past_due"].includes(app.account.subscription_status ?? "") && (
                      <p className="text-xs mt-2" style={{ color: C.warn }}>
                        They pay through Stripe. Approving still works, but their free Pro can only be
                        granted once that subscription is cancelled.
                      </p>
                    )}
                </Section>

                {mode === "view" ? (
                  <Section title="Their discount">
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      <Field label="Discount">
                        <select
                          aria-label="Discount"
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
                          className={fieldClass}
                          style={fieldStyle}
                        >
                          <option value="percent">Percentage off</option>
                          <option value="amount">Amount off (£)</option>
                        </select>
                      </Field>
                      <Field label={discountType === "percent" ? "Percent off" : "Amount off (£)"}>
                        <input
                          type="number"
                          aria-label={discountType === "percent" ? "Percent off" : "Amount off (£)"}
                          step={discountType === "percent" ? "1" : "0.01"}
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className={fieldClass}
                          style={fieldStyle}
                        />
                      </Field>
                    </div>
                    {discount && (
                      <p className="text-xs" style={{ color: C.muted }}>
                        Teachers get {describeDiscount(discount, "month")} on a monthly plan, or{" "}
                        {describeDiscount(yearlyEquivalentDiscount(discount), "year")} on a yearly
                        plan. It cannot be changed once the code exists.
                      </p>
                    )}
                  </Section>
                ) : (
                  <Section title="Decline">
                    <Field label="Reason" help="Optional. Shown to them on their status page.">
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        className={fieldClass}
                        style={fieldStyle}
                        placeholder="Thanks for applying. We're keeping the programme small for now."
                      />
                    </Field>
                  </Section>
                )}

                {error && (
                  <p className="text-sm" role="alert" style={{ color: C.danger }}>
                    {error}
                  </p>
                )}
              </>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Btn onClick={close}>Close</Btn>
            <div className="flex-1" />
            {app && mode === "view" && (
              <>
                <a
                  href={`mailto:${app.email}?subject=${encodeURIComponent("Your Jooma Ambassador application")}`}
                  className="text-sm font-semibold rounded-lg border px-4 py-2 hover:bg-black/5"
                  style={{ borderColor: C.border, color: C.ink }}
                >
                  Ask a question
                </a>
                <Btn variant="danger" onClick={() => setMode("decline")} disabled={busy}>
                  Decline
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => act("approve", close)}
                  disabled={busy || !discount || app.checks.code_taken}
                >
                  {busy ? "Approving…" : "Approve and issue code"}
                </Btn>
              </>
            )}
            {app && mode === "decline" && (
              <>
                <Btn onClick={() => setMode("view")} disabled={busy}>
                  Back
                </Btn>
                <Btn variant="danger" onClick={() => act("decline", close)} disabled={busy}>
                  {busy ? "Declining…" : "Decline application"}
                </Btn>
              </>
            )}
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
