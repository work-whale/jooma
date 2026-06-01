"use client";

import { useState } from "react";

// Opens the Stripe Billing Portal. Server creates the session; we redirect.
export default function ManageButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Could not open the billing portal.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
      >
        {loading ? "Opening…" : "Manage subscription"}
      </button>
      {error && <p className="text-sm mt-2" style={{ color: "#c2342b" }}>{error}</p>}
    </div>
  );
}
