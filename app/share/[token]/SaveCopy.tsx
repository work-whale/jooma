"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/lib/auth/client";
import { saveLinkCopy } from "@/app/lib/resourceLinksClient";
import styles from "./share.module.css";

/*
 * "Save to my library" on a shared resource.
 *
 * Signed out, it is a sign-in link that comes back here (/share is one of the
 * honoured next paths). Signed in, it calls save_resource_link_copy(), which
 * makes the copy in the caller's own library: a deck gets its own
 * presentation, so editing the copy never touches the original.
 */
export default function SaveCopy({ token, toolHref }: { token: string; toolHref: string | null }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [openHref, setOpenHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.user);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/share/${token}`)}`} className={styles.signin} data-testid="save-copy-signin">
        Sign in to save a copy
      </Link>
    );
  }

  if (openHref) {
    return (
      <Link href={openHref} className={styles.save} data-testid="open-copy">
        Saved. Open your copy
      </Link>
    );
  }

  const save = async () => {
    setState("busy");
    try {
      const { runId, presentationId } = await saveLinkCopy(token);
      setOpenHref(presentationId ? `/editor/${presentationId}` : toolHref ? `${toolHref}?run=${runId}` : "/folders");
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <button type="button" className={styles.save} onClick={save} disabled={state === "busy"} data-testid="save-copy">
      {state === "busy" ? "Saving" : state === "error" ? "Could not save. Try again" : "Save to my library"}
    </button>
  );
}
