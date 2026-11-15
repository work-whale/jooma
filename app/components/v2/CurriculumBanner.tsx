"use client";

// The one-time "is this your curriculum?" check.
//
// Teachers who signed up before curricula lived on the profile have one
// inferred for them (from what their browser last picked, else their country,
// else England) and saved unconfirmed. This asks them once. "Keep it" confirms
// it; "Change" goes to the Curriculum section of /profile, where saving also
// confirms it. Either way it never shows again.
//
// Returns null until the profile has loaded and whenever the curriculum is
// already confirmed, which after the first week is almost everyone.

import Link from "next/link";
import { useState } from "react";

import { chooseCurriculum, useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";

export default function CurriculumBanner() {
  const teacher = useTeacherCurriculum();
  const [busy, setBusy] = useState(false);

  if (!teacher.loaded || teacher.confirmed) return null;

  return (
    <div
      role="status"
      data-testid="curriculum-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 lg:px-10 py-3 border-b"
      style={{ backgroundColor: "var(--j-tint)", borderColor: "var(--j-line-2)" }}
    >
      <p className="text-sm" style={{ color: "var(--j-ink)" }}>
        Your tools now start from your curriculum. We have set it to <strong>{teacher.curriculum.name}</strong>.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await chooseCurriculum(teacher.id);
          setBusy(false);
        }}
        className="text-sm font-semibold underline disabled:opacity-60"
        style={{ color: "var(--j-purple)" }}
        data-testid="curriculum-banner-keep"
      >
        Keep it
      </button>
      <Link href="/profile?section=curriculum" className="text-sm font-semibold underline" style={{ color: "var(--j-purple)" }}>
        Change
      </Link>
    </div>
  );
}
