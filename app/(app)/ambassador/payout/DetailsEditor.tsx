"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bank, PaypalLogo, PencilSimple, ShieldCheck } from "@phosphor-icons/react";
import {
  CHANNELS,
  REACH_OPTIONS,
  TAX_STATUS,
  maskAccount,
  reachLabel,
  taxLabel,
} from "@/app/lib/ambassador-application";
import s from "@/app/components/ambassador/programme.module.css";
import type { MyDetails } from "../data";

type Section = "payout" | "personal" | "channels" | "tax";

/**
 * The four blocks of the Payout details tab, each read-only until Edit.
 *
 * Changing where they are paid is allowed at any time, bank to PayPal or back,
 * and is flagged to the admin to verify before the next payout. The full
 * account number is never sent back to the browser, so editing bank details
 * means typing them again.
 */
export default function DetailsEditor({ details }: { details: MyDetails | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Section | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!details) {
    return (
      <section className={s.panel} style={{ marginTop: 0 }}>
        <p className={s.muted}>
          We don&apos;t have your details on file yet. Email ambassadors@jooma.ai and we will add them.
        </p>
      </section>
    );
  }

  const start = (section: Section) => {
    setMessage(null);
    setErrors({});
    setEditing(section);
    if (section === "payout") {
      setValues({
        payout_method: details.payout_method,
        account_holder: details.account_holder,
        sort_code: details.sort_code ?? "",
        account_number: "",
        bank_name: details.bank_name ?? "",
        paypal_email: details.paypal_email ?? "",
      });
    } else if (section === "personal") {
      setValues({
        email: details.email,
        mobile: details.mobile,
        address_line: details.address_line,
        town: details.town,
        postcode: details.postcode,
        school: details.school ?? "",
        teaches: details.teaches ?? "",
      });
    } else if (section === "channels") {
      setValues({
        instagram: details.instagram ?? "",
        tiktok: details.tiktok ?? "",
        x_handle: details.x_handle ?? "",
        facebook: details.facebook ?? "",
        youtube: details.youtube ?? "",
        linkedin: details.linkedin ?? "",
        reach: details.reach,
        note: details.note ?? "",
      });
    } else {
      setValues({ tax_status: TAX_STATUS, utr: "" });
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/ambassadors/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: editing, values }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.errors ?? { _: json.error ?? "Could not save." });
        return;
      }
      setMessage(
        editing === "payout"
          ? "Saved. Your next payout waits a few working days while we check the new details."
          : "Saved.",
      );
      setEditing(null);
      router.refresh();
    } catch {
      setErrors({ _: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, label: string, opts: { full?: boolean; type?: string; placeholder?: string } = {}) => (
    <div className={`${s.f} ${opts.full ? s.full : ""}`}>
      <label htmlFor={`d-${key}`}>{label}</label>
      <input
        id={`d-${key}`}
        className={`${s.input} ${errors[key] ? s.inputBad : ""}`}
        type={opts.type ?? "text"}
        value={values[key] ?? ""}
        placeholder={opts.placeholder}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      />
      {errors[key] && <span className={s.error}>{errors[key]}</span>}
    </div>
  );

  const readonly = (label: string, value: string, full = false) => (
    <div className={`${s.f} ${full ? s.full : ""}`}>
      <label>{label}</label>
      <input className={s.input} value={value} readOnly />
    </div>
  );

  const editButton = (section: Section) =>
    editing === section ? null : (
      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => start(section)}>
        <PencilSimple size={14} weight="bold" /> Edit
      </button>
    );

  const saveRow = (
    <div className={s.actions}>
      <button type="button" className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setEditing(null)} disabled={busy}>
        Cancel
      </button>
      {(errors._ || errors.channels) && <span className={s.error}>{errors._ ?? errors.channels}</span>}
    </div>
  );

  const isBank = (editing === "payout" ? values.payout_method : details.payout_method) === "bank";

  return (
    <>
      {message && (
        <div className={`${s.callout} ${s.calloutGold}`} style={{ marginTop: 0, marginBottom: 14 }} role="status">
          <span>{message}</span>
        </div>
      )}

      <section className={s.panel} style={{ marginTop: 0 }} data-testid="payout-where">
        <div className={s.panelHead}>
          <h2>Where we pay you</h2>
          <span className={s.panelRight}>{editButton("payout")}</span>
        </div>
        {editing === "payout" ? (
          <>
            <div className={s.methods} role="radiogroup" aria-label="How we pay you">
              {(["bank", "paypal"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={values.payout_method === m}
                  className={`${s.method} ${values.payout_method === m ? s.methodOn : ""}`}
                  onClick={() => setValues({ ...values, payout_method: m })}
                >
                  {m === "bank" ? <Bank size={24} weight="duotone" /> : <PaypalLogo size={24} weight="duotone" />}
                  <span>
                    <b>{m === "bank" ? "Bank transfer" : "PayPal"}</b>
                    <span>{m === "bank" ? "A UK account in your name" : "Paid to your PayPal email"}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className={s.fgrid}>
              {field("account_holder", "Account holder", { full: true })}
              {values.payout_method === "bank" ? (
                <>
                  {field("sort_code", "Sort code", { placeholder: "00-00-00" })}
                  {field("account_number", "Account number", { placeholder: "Type all 8 digits" })}
                  {field("bank_name", "Bank", { full: true })}
                </>
              ) : (
                field("paypal_email", "PayPal email", { full: true, type: "email" })
              )}
            </div>
            {saveRow}
          </>
        ) : (
          <div className={s.fgrid}>
            {readonly("Account holder", details.account_holder, true)}
            {isBank ? (
              <>
                {readonly("Sort code", details.sort_code ?? "")}
                {readonly("Account number", maskAccount(details.account_last4))}
                {readonly("Bank", details.bank_name ?? "", true)}
              </>
            ) : (
              readonly("PayPal email", details.paypal_email ?? "", true)
            )}
          </div>
        )}
        <div className={s.callout}>
          <ShieldCheck size={17} weight="fill" />
          <span>
            Changing these details pauses your next payout for 3 working days while we verify them.
            It is a fraud check, and it protects you more than us.
          </span>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2>Your details</h2>
          <span className={s.panelRight}>{editButton("personal")}</span>
        </div>
        {editing === "personal" ? (
          <>
            <div className={s.fgrid}>
              {readonly("Name", `${details.first_name} ${details.last_name}`)}
              {field("email", "Email", { type: "email" })}
              {field("mobile", "Mobile")}
              {field("address_line", "Address", { full: true })}
              {field("town", "Town or city")}
              {field("postcode", "Postcode")}
              {field("school", "School or setting", { full: true })}
              {field("teaches", "What you teach", { full: true })}
            </div>
            <p className={s.hint} style={{ marginTop: 8 }}>
              Your name is on your signed agreement. To change it, email ambassadors@jooma.ai.
            </p>
            {saveRow}
          </>
        ) : (
          <div className={s.fgrid}>
            {readonly("Name", `${details.first_name} ${details.last_name}`)}
            {readonly("Email", details.email)}
            {readonly("Mobile", details.mobile)}
            {readonly("Address", `${details.address_line}, ${details.town} ${details.postcode}`)}
          </div>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2>Where you post</h2>
          <span className={s.panelRight}>{editButton("channels")}</span>
        </div>
        {editing === "channels" ? (
          <>
            <div className={s.fgrid}>
              {CHANNELS.map((ch) => (
                <div key={ch.key} className={s.f}>
                  <label htmlFor={`d-${ch.key}`}>{ch.label}</label>
                  <div className={s.pre}>
                    <span className={s.prefix}>{ch.prefix}</span>
                    <input
                      id={`d-${ch.key}`}
                      className={s.input}
                      value={values[ch.key] ?? ""}
                      onChange={(e) => setValues({ ...values, [ch.key]: e.target.value })}
                      placeholder="handle"
                    />
                  </div>
                </div>
              ))}
              <div className={`${s.f} ${s.full}`}>
                <label htmlFor="d-reach">Roughly how many followers, across everything?</label>
                <select id="d-reach" className={s.input} value={values.reach ?? ""} onChange={(e) => setValues({ ...values, reach: e.target.value })}>
                  {REACH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {saveRow}
          </>
        ) : (
          <>
            {CHANNELS.filter((ch) => details[ch.key]).map((ch) => {
              const verified = (details.verified_channels ?? []).includes(ch.key);
              return (
                <div key={ch.key} className={s.rowline} data-testid={`channel-${ch.key}`}>
                  <span className={s.rowMain}>
                    <b>@{details[ch.key]}</b>
                    <span>{ch.label}</span>
                  </span>
                  <span className={s.rowRight}>
                    <span className={`${s.badge} ${verified ? s.bPaid : s.bRev}`}>
                      {verified ? "Verified" : "Unverified"}
                    </span>
                  </span>
                </div>
              );
            })}
            <p className={s.hint} style={{ marginTop: 8 }}>
              We check each account by hand. Changing a handle sets it back to unverified until we
              look again.
            </p>
            <p className={s.muted}>Stated reach: {reachLabel(details.reach)}</p>
          </>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2>Tax</h2>
          <span className={s.panelRight}>{editButton("tax")}</span>
        </div>
        {editing === "tax" ? (
          <>
            <div className={s.fgrid}>
              <div className={s.f}>
                <label htmlFor="d-tax">How you declare</label>
                <input id="d-tax" className={s.input} value={taxLabel(TAX_STATUS)} readOnly />
              </div>
              {field("utr", details.has_utr ? "New UTR (leave blank to keep yours)" : "UTR", { placeholder: "10 digits" })}
            </div>
            {saveRow}
          </>
        ) : (
          <div className={s.fgrid}>
            {readonly("How you declare", taxLabel(details.tax_status))}
            {readonly("UTR", details.has_utr ? "On file" : "Not provided")}
          </div>
        )}
      </section>
    </>
  );
}
