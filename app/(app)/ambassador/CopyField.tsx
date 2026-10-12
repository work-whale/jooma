"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/**
 * A value an ambassador hands out (their code, or the sign up link carrying
 * it), with a copy button. The value stays selectable text as well, because a
 * clipboard can be blocked and the fallback should be obvious, not hidden.
 */
export default function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (permissions, an insecure origin). The text is on
      // screen and selectable, which is the fallback.
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--j-muted)" }}>
        {label}
      </p>
      <div
        className="flex items-center gap-2 rounded-xl border pl-3 pr-1.5 py-1.5"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
      >
        <span
          className={`min-w-0 flex-1 truncate select-all text-sm ${mono ? "font-mono font-bold" : ""}`}
          style={{ color: "var(--j-ink)" }}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
          style={{
            backgroundColor: copied ? "var(--j-gold)" : "var(--j-gold-bg)",
            color: copied ? "#fff" : "var(--j-gold)",
          }}
        >
          {copied ? <Check weight="bold" className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
