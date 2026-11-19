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
  // Jooma 4.5: E8, the Sunday email on Free, has its own switch (spec Step 6,
  // rule 4). Null hides it: before the plans engine migration there is no
  // column to store it in.
  const [sunday, setSunday] = useState<boolean | null>(null);
  const [sundayBusy, setSundayBusy] = useState(false);
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
      const { data: row, error: rowError } = await createClient().from("profiles").select("sunday_emails").maybeSingle();
      if (!cancelled && !rowError && row && typeof (row as { sunday_emails?: unknown }).sunday_emails === "boolean") {
        setSunday((row as { sunday_emails: boolean }).sunday_emails);
      }
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
    // Jooma 4.5: the same choice is marketing consent. Missing column before
    // the migration: ignored.
    {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ marketing_consent: next }).eq("id", user.id);
    }
    setSaved(true);
  };

  const toggleSunday = async () => {
    if (sunday === null || sundayBusy) return;
    const next = !sunday;
    setSunday(next);
    setSundayBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = user
      ? await supabase.from("profiles").update({ sunday_emails: next }).eq("id", user.id)
      : { error: new Error("signed out") };
    setSundayBusy(false);
    if (error) {
      setSunday(!next);
      setError("Could not save that. Please try again.");
    }
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

      {sunday !== null && (
        <div className="flex items-start justify-between gap-6 max-w-xl mt-6">
          <div>
            <p id="sunday-emails-label" className="font-semibold" style={{ color: "var(--j-ink)" }}>
              The Sunday email
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--j-faint)" }}>
              On Free, a short note each Sunday when your resources are back.
            </p>
          </div>
          <Switch on={sunday} busy={sundayBusy} onClick={toggleSunday} labelledBy="sunday-emails-label" testId="sunday-emails-switch" />
        </div>
      )}

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

function Switch({
  on,
  busy,
  onClick,
  labelledBy,
  testId,
}: {
  on: boolean;
  busy: boolean;
  onClick: () => void;
  labelledBy: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className="relative shrink-0 rounded-full transition-colors disabled:opacity-60"
      style={{ width: 48, height: 28, backgroundColor: on ? "var(--j-purple)" : "var(--j-line)" }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 rounded-full bg-white shadow transition-[left]"
        style={{ width: 20, height: 20, left: on ? 24 : 4 }}
      />
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="email-settings"
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
