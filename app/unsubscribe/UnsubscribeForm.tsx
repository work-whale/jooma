"use client";

import { useState } from "react";

type State = "idle" | "working" | "done" | "error";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  // Honeypot. Hidden from people, filled in by bots that fill in everything.
  const [website, setWebsite] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, website }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Could not reach Jooma. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <>
        <h1 className="text-xl font-bold mb-2.5" style={{ color: "var(--j-purple)" }}>
          You are unsubscribed
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--j-body)" }}>
          We will not send you news, updates or reminders any more. You may still get
          emails about your account itself, such as password resets or important
          service notices.
        </p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-bold mb-2.5" style={{ color: "var(--j-purple)" }}>
        Unsubscribe from Jooma emails?
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--j-body)" }}>
        You will stop getting news, updates and reminders from us. Emails about your
        account itself, such as password resets, still arrive.
      </p>

      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto" }}>
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={state === "working" || !token}
        className="w-full rounded-xl px-5 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--j-purple)" }}
      >
        {state === "working" ? "Unsubscribing..." : "Unsubscribe"}
      </button>

      {!token && (
        <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
          This link is missing its code. Use the link from the email itself.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm mt-4" style={{ color: "#B3261E" }}>
          {error}
        </p>
      )}
    </form>
  );
}
