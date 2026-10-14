"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "@phosphor-icons/react";
import s from "@/app/components/ambassador/programme.module.css";

/** The browser's own print dialog, which also saves as PDF. */
export function PrintButton() {
  return (
    <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => window.print()}>
      <Printer size={15} weight="bold" /> Print or save as PDF
    </button>
  );
}

/** Ask to end the agreement. Records the request; a person handles the rest. */
export function EndAgreement({ requestedAt }: { requestedAt: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requestedAt) {
    return (
      <p className={s.muted} data-testid="end-requested">
        You asked to end your agreement on{" "}
        {new Date(requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. We
        will be in touch about your notice period and final payout.
      </p>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ambassadors/end-agreement", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not send that request.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.actions} style={{ marginTop: 16 }}>
      {confirming ? (
        <>
          <button type="button" className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Yes, I want to end it"}
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setConfirming(false)} disabled={busy}>
            Keep my agreement
          </button>
        </>
      ) : (
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirming(true)}>
          Request to end my agreement
        </button>
      )}
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}
