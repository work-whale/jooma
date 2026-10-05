"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FcGoogle } from "react-icons/fc";
import { X } from "lucide-react";
import Modal from "@/app/components/Modal";
import { createClient } from "@/app/lib/auth/client";
import {
  PENDING_ACTION_KEY,
  gateTitle,
  type GuestAction,
  type GuestKind,
} from "@/app/lib/guest-actions";
import styles from "./guest.module.css";

/**
 * The sign up prompt behind every action on a guest's output.
 *
 * Chalkie's shape: Google first, then an email that carries on into our own
 * sign up pages (password, profile, a plan with its three day trial), then a
 * way in for someone who already has an account. Whatever they make here is
 * kept and lands in their library once they are signed in, which the copy
 * says plainly because it is the reason to sign up rather than leave.
 */
export default function AuthGateModal({
  open,
  kind,
  action,
  message,
  googleSignin,
  onClose,
}: {
  open: boolean;
  kind: GuestKind;
  action: GuestAction | null;
  /** Overrides the lede, e.g. when today's free try has been used. */
  message?: string | null;
  googleSignin: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remember = () => {
    if (!action) return;
    try {
      localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({ action, kind, at: Date.now() }));
    } catch {
      // Storage blocked. The work is still claimed on sign up; only the jump
      // straight to this action is lost.
    }
  };

  // Remembered as soon as they ask, not only when they press a button here:
  // they may close this and sign up from the header instead, and the action
  // they wanted should still be waiting for them.
  useEffect(() => {
    if (open) remember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action, kind]);

  const google = async () => {
    setError(null);
    remember();
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) setError("Could not start Google sign in. Try your email instead.");
  };

  const withEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("That does not look like an email address.");
      return;
    }
    remember();
    // A full navigation rather than router.push. The sign up flow is a
    // different part of the site with nothing to share with this page, and a
    // client transition here could sit behind this page's own refresh (it
    // refreshes the "Your creations" list once a deck is saved) and never land.
    window.location.assign(`/signup?email=${encodeURIComponent(value)}`);
  };

  const what = kind === "slides" ? "deck" : "comprehension";

  return (
    <Modal open={open} onClose={onClose} width="min(440px, 94vw)">
      <div className={styles.gate} data-testid="auth-gate">
        <button type="button" className={styles.gateClose} onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <h2 className={styles.gateTitle}>{gateTitle(kind, action)}</h2>
        <p className={styles.gateLede}>
          {message ??
            `Your ${what} is saved to your account the moment you sign up, along with anything else you made here. Every plan starts with a free three day trial.`}
        </p>

        {googleSignin && (
          <>
            <button type="button" className={styles.google} onClick={google}>
              <FcGoogle aria-hidden="true" />
              Continue with Google
            </button>
            <div className={styles.or}>
              <span />
              or
              <span />
            </div>
          </>
        )}

        <form onSubmit={withEmail} className={styles.gateForm}>
          <label htmlFor="gate-email" className={styles.srOnly}>
            Email
          </label>
          <input
            id="gate-email"
            type="email"
            autoComplete="email"
            placeholder="you@school.sch.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.gateInput}
          />
          <button type="submit" className={styles.gateSubmit}>
            Start free trial
          </button>
        </form>

        {error && (
          <p className={styles.gateError} role="alert">
            {error}
          </p>
        )}

        <Link href="/login" className={styles.gateLogin} onClick={remember}>
          I already have an account
        </Link>
      </div>
    </Modal>
  );
}
