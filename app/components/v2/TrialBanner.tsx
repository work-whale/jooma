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
  if (!access || access.state === "subscribed") return null;

  // A locked account that can still take a trial has the button on Today. Telling
  // them a trial "has ended" would be untrue: they never had one.
  const message =
    access.state === "trial"
      ? `${access.trialDaysLeft} ${access.trialDaysLeft === 1 ? "day" : "days"} left of your free trial.`
      : access.lapsed
        ? "Your plan has ended. Choose a plan to keep using all 35 tools and exports."
        : access.canStartTrial
          ? "Start your free trial or choose a plan to use all 35 tools and exports."
          : "Your free trial has ended. Choose a plan to keep using all 35 tools and exports.";

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
