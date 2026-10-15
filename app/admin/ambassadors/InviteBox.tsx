"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { INVITE_TTL_DAYS } from "@/app/lib/ambassador-commission";
import styles from "./ambassadors.module.css";

/**
 * Make a one-person invite link.
 *
 * One click and nothing to fill in, so a link can be made and pasted into a DM
 * straight away. The person signs in to their own account and applies, so their
 * name, email and the rest arrive with the application. The link is copied as
 * soon as it is made and shown once: only its hash is stored.
 */
export default function InviteBox() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused; the link is on screen to select by hand.
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/ambassadors/invites", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create the link.");
        return;
      }
      setLink(json.url);
      await copy(json.url);
      // The "Invite links issued" list below reads the new row.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.genbox} data-testid="invite-box">
      <h2 className={styles.genTitle}>Create an invite link</h2>
      <p className={styles.genSub}>
        One link, one person. It expires after {INVITE_TTL_DAYS} days and can only be used once.
      </p>
      <button type="button" className={styles.goldBtn} onClick={generate} disabled={busy}>
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
          <button type="button" onClick={() => copy(link)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {link && (
        <p className={styles.genSub}>
          Paste it to the person you want to invite. For safety it is not shown again; make a
          new one if it gets lost.
        </p>
      )}
    </div>
  );
}
