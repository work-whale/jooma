"use client";

// The standing prompt to choose a plan, on every screen with the shell.
//
// Sits beside DeletionBanner and, like it, is the state of the account rather
// than an announcement. Not dismissible once locked: choosing a plan is the one
// thing that changes it. Returns null for anyone with a plan, and while the state
// loads, so mounting it costs a paying teacher nothing they can see.

import Link from "next/link";
import { useAccountAccess } from "@/app/lib/useAccountAccess";

export default function TrialBanner() {
  const access = useAccountAccess();
  if (!access || access.state !== "locked") return null;

  // The trial no longer says anything up here. While it runs, its countdown is
  // in the sidebar's plan card (and a chip in the top bar on a phone). When it
  // ends, TrialEndedModal says so, with the 50% offer. A strip across the top of
  // every screen looked out of place, and a line is easy to read past.
  //
  // What is left: a plan that lapsed, an account that has never had a trial,
  // and a review trial that ended (which has no popup).
  // A locked account that can still take one has the button on Today; telling
  // them a trial "has ended" would be untrue, they never had one.
  if (access.hadTrial && !access.lapsed) return null;
  const message = access.lapsed
    ? "Your plan has ended. Choose a plan to keep using all 35 tools and exports."
    : access.canStartTrial
      ? "Start your free trial or choose a plan to use all 35 tools and exports."
      : // An ambassador applicant's review trial: no no-card trial, so no popup.
        "Your free trial has ended. Choose a plan to keep using all 35 tools and exports.";

  return (
    <div
      role="status"
      data-testid="trial-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 lg:px-10 py-3 border-b"
      style={{
        backgroundColor: "var(--j-tint)",
        borderColor: "var(--j-line-2)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--j-ink)" }}>
        {message}
      </p>
      <Link href="/pricing" className="text-sm font-semibold underline" style={{ color: "var(--j-purple)" }}>
        Choose a plan
      </Link>
    </div>
  );
}
