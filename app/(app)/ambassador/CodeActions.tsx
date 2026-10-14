"use client";

import { useState } from "react";
import { Copy, ShareNetwork } from "@phosphor-icons/react";
import s from "@/app/components/ambassador/programme.module.css";

/** Copy the code, or the sign up link that carries it. */
export default function CodeActions({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : link);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard refused; the code is on screen to select.
    }
  };

  return (
    <div className={s.codeActs}>
      <button type="button" className={s.cbtn} onClick={() => copy("code")}>
        <Copy size={15} weight="bold" />
        {copied === "code" ? "Copied" : "Copy code"}
      </button>
      <button type="button" className={`${s.cbtn} ${s.cbtnGhost}`} onClick={() => copy("link")}>
        <ShareNetwork size={15} weight="bold" />
        {copied === "link" ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
