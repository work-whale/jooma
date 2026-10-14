"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { SOURCE_OPTIONS } from "@/app/lib/ambassador-application";
import { INVITE_TTL_DAYS } from "@/app/lib/ambassador-commission";
import styles from "./ambassadors.module.css";

/**
 * Make a one-person invite link.
 *
 * A name and where we found them, nothing else. The person signs in to their
 * own account and applies, so their email and the rest arrive with the
 * application. The link is shown once: only its hash is stored.
 */
export default function InviteBox() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [source, setSource] = useState<string>(SOURCE_OPTIONS[0].value);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/ambassadors/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, source }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create the link.");
        return;
      }
      setLink(json.url);
      setName("");
      // The "Invite links issued" list below reads the new row.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused; the link is on screen to select by hand.
    }
  };

  return (
    <div className={styles.genbox} data-testid="invite-box">
      <h2 className={styles.genTitle}>Create an invite link</h2>
      <p className={styles.genSub}>
        One link, one person. It expires after {INVITE_TTL_DAYS} days and can only be used once.
      </p>
      <div className={styles.genRow}>
        <label>
          <span className={styles.genLabel}>Their name</span>
          <input
            className={styles.genInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya Raman"
            maxLength={120}
          />
        </label>
        <label>
          <span className={styles.genLabel}>Where you found them</span>
          <select
            className={styles.genInput}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className={styles.goldBtn}
        onClick={generate}
        disabled={busy || !name.trim()}
      >
        <Link2 className="w-3.5 h-3.5" />
        {busy ? "Generating…" : "Generate link"}
      </button>
      {error && (
        <p className="mt-3 text-sm font-semibold" role="alert" style={{ color: "#FFD2CC" }}>
          {error}
        </p>
      )}
      {link && (
        <div className={styles.linkOut}>
          <code data-testid="invite-link">{link}</code>
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {link && (
        <p className={styles.genSub}>
          Copy it now. For safety it is not shown again; make a new one if it gets lost.
        </p>
      )}
    </div>
  );
}
