"use client";

import { useState } from "react";

/**
 * One tap to the no-card trial, for an account that has not had one: someone who
 * signed up before the card was dropped, or whose signup call failed.
 *
 * A full navigation on success, because the account state and the sidebar's plan
 * are read once per page load.
 */
export default function StartTrialButton({
  className,
  style,
  next = "/dashboard",
}: {
  className?: string;
  style?: React.CSSProperties;
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trial/start", { method: "POST" });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Could not start your trial.");
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" onClick={start} disabled={busy} className={className} style={style} data-testid="start-trial">
        {busy ? "Starting…" : "Start your 3 day free trial"}
      </button>
      {error && (
        <p role="alert" className="text-sm mt-2" style={{ color: "#c2342b" }}>
          {error}
        </p>
      )}
    </>
  );
}
