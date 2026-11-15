"use client";

import Link from "next/link";

import { isToolHiddenFor } from "@/app/lib/curricula/tool-scope";
import { useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";

/**
 * Shown above a tool built only for UK schools (Pupil Premium, Inspection
 * Prep, ECT Report, the two EYFS tools) when a teacher on another school
 * system opens it by a direct link. The tool is hidden from their grid and
 * search but not blocked: the note says what it is built for and lets them
 * carry on.
 */
export default function UkOnlyToolNote({ pathname }: { pathname: string }) {
  const teacher = useTeacherCurriculum();
  const slug = pathname.replace(/^\/tools\//, "").split("/")[0];
  if (!teacher.loaded || !isToolHiddenFor(slug, teacher.id)) return null;

  return (
    <div
      role="note"
      data-testid="uk-only-tool-note"
      className="mb-4 rounded-2xl border px-4 py-3 text-sm"
      style={{ backgroundColor: "var(--j-tint)", borderColor: "var(--j-line-2)", color: "var(--j-ink)" }}
    >
      This tool is built for schools in the UK, so it follows English frameworks rather than the {teacher.curriculum.name}.{" "}
      <Link href="/tools" className="font-semibold underline" style={{ color: "var(--j-purple)" }}>
        See the tools for your curriculum
      </Link>
    </div>
  );
}
