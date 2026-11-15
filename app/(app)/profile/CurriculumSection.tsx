"use client";

// Curriculum: the school system every tool starts from.
//
// Saved on the profile (profiles.curriculum_id) so it follows the teacher to
// any device. Each tool still lets them pick another for a single resource;
// this is only the default. Choosing one also switches the output language to
// that curriculum's own, if they have never picked a language themselves.

import { useState } from "react";

import CurriculumPicker from "@/app/components/CurriculumPicker";
import { INPUT_CLASS } from "@/app/components/ui/FormFields";
import { chooseCurriculum, useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";

export default function CurriculumSection() {
  const teacher = useTeacherCurriculum();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const value = draft ?? teacher.id;
  const changed = draft !== null && draft !== teacher.id;

  const save = async () => {
    if (!value || busy) return;
    setBusy(true);
    setStatus(null);
    const ok = await chooseCurriculum(value);
    setBusy(false);
    if (ok) setDraft(null);
    setStatus(ok ? { ok, text: "Saved. Your tools will start from this curriculum." } : { ok, text: "Could not save that. Please try again." });
  };

  return (
    <div className="rounded-3xl p-6 sm:p-8 border" style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}>
      <h2 className="text-lg font-bold mb-2" style={{ color: "var(--j-ink)" }}>
        Curriculum
      </h2>
      <p className="text-sm mb-6 max-w-xl" style={{ color: "var(--j-faint)" }}>
        The curriculum your tools start from, with its own year names, standards and assessments. You can still pick another on any tool for a single resource.
      </p>

      {!teacher.loaded ? (
        <div className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: "var(--j-line)" }} />
      ) : (
        <div className="max-w-xl">
          <CurriculumPicker
            value={value}
            onChange={(id) => {
              setDraft(id);
              setStatus(null);
            }}
            offered={teacher.offered}
            selectClassName={INPUT_CLASS}
          />
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={busy || !value || (!changed && teacher.confirmed)}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--j-purple)" }}
              data-testid="curriculum-save"
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <p className="text-sm" role="status" aria-live="polite" data-testid="curriculum-status">
              {status && <span className={status.ok ? "" : "text-red-600"} style={status.ok ? { color: "var(--j-faint)" } : undefined}>{status.text}</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
