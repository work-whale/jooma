"use client";

import { useState } from "react";
import { AGREEMENT_VERSION } from "@/app/lib/ambassador-agreement";
import { AGREEMENT_CHANGES } from "@/app/lib/ambassador-agreement-status";
import s from "@/app/components/ambassador/programme.module.css";

/**
 * Accept the current agreement in place of the older one they signed. Records
 * a second dated signature; the first is kept. Optional: their version stays
 * in force until they accept.
 */
export default function AcceptAgreement({
  onVersion,
  fullName,
  bringsClauseFive,
}: {
  onVersion: string;
  fullName: string;
  /** They signed before clause 5 (keeping your place), so accepting brings it in. */
  bringsClauseFive: boolean;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ambassadors/accept-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: AGREEMENT_VERSION, signature_name: name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not record that. Try again.");
        setBusy(false);
        return;
      }
      // A full load, not router.refresh(): on these pages the refreshed payload
      // arrives correct but is not applied (seen in the E2E, 20 Nov 2026), and
      // the banner in the layout has to go too. Accepting happens once. Busy
      // stays on until the page is replaced.
      window.location.replace("/ambassador/agreement");
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  const signed = name.trim().length >= 4;

  return (
    <div data-testid="accept-agreement">
      <p className={s.muted} style={{ marginTop: 0 }}>
        You signed version {onVersion}. Version {AGREEMENT_VERSION} is below. Accepting it is up to you: until you do,
        version {onVersion} stays in force exactly as you signed it.
      </p>
      <p style={{ margin: "12px 0 6px", fontWeight: 600 }}>What changed</p>
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
        {AGREEMENT_CHANGES.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {bringsClauseFive && (
        <div className={`${s.callout} ${s.calloutWarn}`} data-testid="clause-five-note" style={{ marginTop: 14 }}>
          <span>
            Your version had no clause 5 (keeping your place). Version {AGREEMENT_VERSION} does. If you accept, it
            applies to you from the day you accept, so no month before then counts.
          </span>
        </div>
      )}

      <div className={s.sigbox} style={{ marginTop: 16 }}>
        <div className={s.f}>
          <label htmlFor="amb-accept-sign">Type your full name to accept version {AGREEMENT_VERSION}</label>
          <input
            id="amb-accept-sign"
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={fullName || "Your full name"}
            autoComplete="name"
          />
          <span className={s.hint}>
            Typing your name here is a legally binding electronic signature under the Electronic Communications Act
            2000.
          </span>
        </div>
        <div className={s.sigpad}>
          <div>
            <span className={s.sig}>{name.trim() || " "}</span>
            <small>
              {signed
                ? `Accepted ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                : "Not yet accepted"}
            </small>
          </div>
        </div>
      </div>

      <div className={s.actions} style={{ marginTop: 16 }}>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={accept} disabled={busy || !signed}>
          {busy ? "Saving…" : `Accept version ${AGREEMENT_VERSION}`}
        </button>
        {error && (
          <span className={s.error} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
