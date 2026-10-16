"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import styles from "./ambassadors.module.css";

/**
 * The programme's one link, to paste into a chat. It used to be a generator of
 * single-use invite links; now anyone with this link can apply, and every
 * application is still reviewed here before a code is made.
 *
 * `display` is the short form people see ("jooma.ai/ambassador"); `url` is the
 * full address copied, so a chat app always makes it clickable.
 */
export default function ShareLinkBox({ url, display }: { url: string; display: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused; the link is on screen to select by hand.
    }
  };

  return (
    <div className={styles.genbox} data-testid="share-link-box">
      <h2 className={styles.genTitle}>Share the programme</h2>
      <p className={styles.genSub}>
        One link for everyone. Whoever opens it can apply, and you review every application
        below before their code is made.
      </p>
      <div className={styles.linkOut}>
        <code data-testid="share-link">{display}</code>
        <button type="button" onClick={copy}>
          <Link2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
