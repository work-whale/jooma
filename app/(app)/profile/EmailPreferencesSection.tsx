"use client";

// Emails: the one switch a teacher has over our bulk email.
//
// On means product news, general updates and signup reminders may reach them;
// off puts their address on email_opt_outs, the same list the unsubscribe link
// in every email writes to. Service notices ignore it, which the hint says.
//
// Read and written through my_email_preferences() and set_my_product_emails(),
// definer functions that only ever touch the caller's own address. The list is
// otherwise service role only, so a teacher cannot see who else is on it.
//
// Saves on toggle rather than with a Save button: one switch, nothing to batch.
// The switch moves at once and moves back if the save fails.

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/auth/client";
import { PREFERENCE_HINT, PREFERENCE_LABEL } from "@/app/lib/product-emails";
import { EmailPreferencesSkeleton } from "./Skeletons";

export default function EmailPreferencesSection() {
  const [on, setOn] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("my_email_preferences");
      if (cancelled) return;
      if (error) {
        console.error("[profile/emails] could not load preferences", error);
        setLoadError(true);
        return;
      }
      setOn((data as { product_emails?: boolean } | null)?.product_emails !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  const toggle = async () => {
    if (on === null || busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error } = await createClient().rpc("set_my_product_emails", { p_on: next });
    setBusy(false);
    if (error) {
      console.error("[profile/emails] could not save preference", error);
      setOn(!next);
      setError("Could not save that. Please try again.");
      return;
    }
    setSaved(true);
  };

  if (loadError) {
    return (
      <Card>
        <p className="text-sm" style={{ color: "var(--j-faint)" }}>
          Could not load your email settings. Refresh the page to try again.
        </p>
      </Card>
    );
  }
  if (on === null) return <EmailPreferencesSkeleton />;

  return (
    <Card>
      <div className="flex items-start justify-between gap-6 max-w-xl">
        <div>
          <p id="product-emails-label" className="font-semibold" style={{ color: "var(--j-ink)" }}>
            {PREFERENCE_LABEL}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--j-faint)" }}>
            {PREFERENCE_HINT}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="product-emails-label"
          onClick={toggle}
          disabled={busy}
          data-testid="product-emails-switch"
          className="relative shrink-0 rounded-full transition-colors disabled:opacity-60"
          style={{
            width: 48,
            height: 28,
            backgroundColor: on ? "var(--j-purple)" : "var(--j-line)",
          }}
        >
          <span
            aria-hidden="true"
            className="absolute top-1 rounded-full bg-white shadow transition-[left]"
            style={{ width: 20, height: 20, left: on ? 24 : 4 }}
          />
        </button>
      </div>

      <p className="text-sm mt-4 min-h-5" role="status" aria-live="polite" data-testid="product-emails-status">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : saved ? (
          <span style={{ color: "var(--j-faint)" }}>
            {on ? "You will get product news and updates." : "You will not get product news and updates."}
          </span>
        ) : null}
      </p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl p-6 sm:p-8 border"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <h2 className="text-lg font-bold mb-6" style={{ color: "var(--j-ink)" }}>
        Emails
      </h2>
      {children}
    </div>
  );
}
