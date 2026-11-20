"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChatCircleDots,
  CircleNotch,
  Copy,
  DotsThreeOutline,
  InstagramLogo,
  LinkSimple,
  MessengerLogo,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import { shareLinkUrl, shareTargets, type ShareTarget } from "@/app/lib/resource-links";
import { createLink, liveLinkToken, revokeLink } from "@/app/lib/resourceLinksClient";
import styles from "./ShareLinkPanel.module.css";

/*
 * Share by link: the Link side of the share dialog.
 *
 * One live link per resource. Nothing is public until the teacher presses
 * "Create link", and "Turn off link" kills it for good (turning it on again
 * makes a new one, so a link already posted somewhere stays dead).
 *
 * Which apps, and how each is reached, is pure logic in
 * app/lib/resource-links.ts. Instagram takes no link from a web page, so on a
 * computer it copies the link and opens the inbox to paste it into; Messenger
 * does the same unless NEXT_PUBLIC_FACEBOOK_APP_ID is set.
 */

const ICONS: Record<ShareTarget["id"], React.ReactNode> = {
  whatsapp: <WhatsappLogo weight="fill" />,
  viber: <ChatCircleDots weight="fill" />,
  messenger: <MessengerLogo weight="fill" />,
  instagram: <InstagramLogo weight="fill" />,
  copy: <Copy weight="bold" />,
  more: <DotsThreeOutline weight="fill" />,
};

function isMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareLinkPanel({ runId, title }: { runId: string; title: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    liveLinkToken(runId)
      .then((t) => {
        if (!cancelled) setToken(t);
      })
      .catch(() => {
        if (!cancelled) setError("The link could not be loaded. Try again.");
      })
      .finally(() => {
        if (!cancelled) setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const url = token ? shareLinkUrl(window.location.origin, token) : null;

  const targets = useMemo(() => {
    if (!url) return [];
    return shareTargets({
      url,
      title,
      mobile: isMobileDevice(),
      canNativeShare: typeof navigator.share === "function",
      facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
    });
  }, [url, title]);

  const make = async () => {
    setState("busy");
    setError(null);
    try {
      setToken(await createLink(runId));
    } catch {
      setError("The link could not be made. Try again.");
    } finally {
      setState("ready");
    }
  };

  const turnOff = async () => {
    setState("busy");
    setError(null);
    try {
      await revokeLink(runId);
      setToken(null);
      setNote("Link turned off. Anyone who has it now sees nothing.");
    } catch {
      setError("The link could not be turned off. Try again.");
    } finally {
      setState("ready");
    }
  };

  const act = async (t: ShareTarget) => {
    if (!url) return;
    setNote(null);
    if (t.kind === "native") {
      try {
        await navigator.share({ title, text: title, url });
      } catch {
        /* the teacher closed the sheet */
      }
      return;
    }
    const copied = await copyText(url);
    if (t.kind === "copy") {
      setNote(copied ? "Link copied." : "Copy the link from the box above.");
      return;
    }
    // copy-then-open
    setNote(copied ? `Link copied. Paste it into a chat in ${t.label}.` : `Copy the link above, then paste it into ${t.label}.`);
    window.open(t.href, "_blank", "noopener,noreferrer");
  };

  if (state === "loading") {
    return (
      <p className={styles.state} role="status">
        <CircleNotch className={styles.spin} />
        Loading
      </p>
    );
  }

  if (!url) {
    return (
      <div className={styles.panel}>
        <p className={styles.explain}>
          Make a link anyone can open to view this resource, with no sign in. Check it has no pupil names
          before you share it.
        </p>
        {note && (
          <p className={styles.note} role="status">
            {note}
          </p>
        )}
        {error && (
          <p className={styles.error} role="status">
            {error}
          </p>
        )}
        <button type="button" className={styles.make} onClick={make} disabled={state === "busy"}>
          <LinkSimple weight="bold" />
          {state === "busy" ? "Making the link" : "Create link"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <label className={styles.urlRow}>
        <span className={styles.srOnly}>Share link</span>
        <input className={styles.url} readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="share-link-url" />
      </label>

      <div className={styles.targets} role="group" aria-label="Share to">
        {targets.map((t) =>
          t.kind === "open" ? (
            <a
              key={t.id}
              href={t.href}
              // A web page opens beside Jooma; an app's own link (viber://)
              // must not, or it leaves an empty tab behind.
              {...(t.href?.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={`${styles.target} ${styles[t.id] ?? ""}`}
              data-target={t.id}
            >
              <span className={styles.targetIcon}>{ICONS[t.id]}</span>
              {t.label}
            </a>
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => void act(t)}
              className={`${styles.target} ${styles[t.id] ?? ""}`}
              data-target={t.id}
            >
              <span className={styles.targetIcon}>{ICONS[t.id]}</span>
              {t.label}
            </button>
          ),
        )}
      </div>

      <p className={styles.explain}>Anyone with the link can view it. Jooma teachers can save a copy; yours stays untouched.</p>

      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {error && (
        <p className={styles.error} role="status">
          {error}
        </p>
      )}

      <button type="button" className={styles.off} onClick={turnOff} disabled={state === "busy"}>
        {state === "busy" ? "Turning it off" : "Turn off link"}
      </button>
    </div>
  );
}
