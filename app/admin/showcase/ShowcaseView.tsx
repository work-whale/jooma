"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import MiniSlide from "@/app/components/editor/MiniSlide";
import type { SlideJSON } from "@/app/lib/presentations";
import { fmtDateTime } from "../format";
import { Btn, C, Card, EmptyState, FilterBar, Note, PageHead, Tag, useToast } from "../ui";

export interface ShowcaseRow {
  id: string;
  kind: "slides" | "comprehension" | "worksheet";
  slug: string;
  title: string;
  subject: string | null;
  year_label: string | null;
  region: string | null;
  teacher_name: string | null;
  teacher_email: string | null;
  status: string;
  position: number | null;
  presentation_id: string | null;
  tool_run_id: string | null;
  first_slide: SlideJSON | null;
  excerpt: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const TABS = [
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "On the homepage" },
  { id: "rejected", label: "Turned down" },
  { id: "withdrawn", label: "Withdrawn by teacher" },
] as const;

const KIND_LABEL = { slides: "Slides", comprehension: "Comprehension", worksheet: "Worksheet" };

export default function ShowcaseView({
  status,
  rows,
  loadError,
}: {
  status: string;
  rows: ShowcaseRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, string>>({});

  const review = async (row: ShowcaseRow, next: "approved" | "rejected" | "pending") => {
    setBusy(row.id);
    const raw = positions[row.id] ?? (row.position === null ? "" : String(row.position));
    const pos = raw.trim() === "" ? null : Number(raw);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_review_showcase", {
      p_id: row.id,
      p_status: next,
      p_position: Number.isFinite(pos) ? pos : null,
    });
    setBusy(null);
    if (error) {
      fire(error.message);
      return;
    }
    // The landing page reads a cached list; this makes the change show now.
    // Awaited, so the landing page is fresh by the time the toast says so.
    await fetch("/api/admin/showcase/revalidate", { method: "POST" }).catch(() => {});
    fire(
      next === "approved"
        ? "On the homepage."
        : next === "rejected"
          ? "Turned down. It will not appear."
          : "Moved back to waiting.",
    );
    router.refresh();
  };

  return (
    <div>
      <PageHead
        title="Made with Jooma"
        sub="Resources teachers have offered for the landing page. Nothing appears there until it is approved here. The first six approved, by position, are shown."
      />

      <Card>
        <FilterBar>
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/admin/showcase?status=${t.id}`}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: status === t.id ? C.brandBg : "transparent",
                color: status === t.id ? C.brand : C.muted,
              }}
            >
              {t.label}
            </Link>
          ))}
        </FilterBar>

        {loadError ? (
          <div className="p-5">
            <Note>Could not load the queue: {loadError}</Note>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing here"
            body={
              status === "pending"
                ? "When a teacher says yes to sharing a resource, it waits here for review."
                : undefined
            }
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: C.divider }}>
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-5 p-5">
                <div
                  className="w-[240px] h-[135px] rounded-lg overflow-hidden border shrink-0"
                  style={{ borderColor: C.border, backgroundColor: C.divider }}
                >
                  {row.kind === "slides" && row.first_slide ? (
                    <MiniSlide slide={row.first_slide} width={240} themeId={row.first_slide.themeId} thumbnailMode />
                  ) : (
                    <p className="p-3 text-xs leading-relaxed" style={{ color: C.muted }}>
                      {(row.excerpt ?? "").slice(0, 260)}
                    </p>
                  )}
                </div>

                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Tag tone="brand">{KIND_LABEL[row.kind]}</Tag>
                    <span className="text-xs" style={{ color: C.muted }}>
                      Offered {fmtDateTime(row.created_at)}
                    </span>
                  </div>
                  <p className="text-base font-bold" style={{ color: C.ink }}>
                    {row.title}
                  </p>
                  <p className="text-sm mt-1" style={{ color: C.ink2 }}>
                    {row.teacher_name ?? "No name on the profile"}
                    {row.teacher_email ? ` (${row.teacher_email})` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                    {[row.subject, row.year_label, row.region].filter(Boolean).join(" · ") ||
                      "No subject, year or country recorded"}
                  </p>
                  {status === "approved" && (
                    <Link
                      href={`/made/${row.slug}`}
                      className="inline-block text-xs font-semibold mt-2"
                      style={{ color: C.brand }}
                      target="_blank"
                    >
                      Open the public page
                    </Link>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {status !== "withdrawn" && (
                    <label className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                      Position
                      <input
                        type="number"
                        min={1}
                        className="w-16 text-sm rounded-lg border px-2 py-1"
                        style={{ borderColor: C.border }}
                        value={positions[row.id] ?? (row.position === null ? "" : String(row.position))}
                        onChange={(e) => setPositions((p) => ({ ...p, [row.id]: e.target.value }))}
                      />
                    </label>
                  )}
                  <div className="flex gap-2">
                    {status === "pending" && (
                      <>
                        <Btn variant="primary" disabled={busy === row.id} onClick={() => review(row, "approved")}>
                          Approve
                        </Btn>
                        <Btn variant="ghost" disabled={busy === row.id} onClick={() => review(row, "rejected")}>
                          Turn down
                        </Btn>
                      </>
                    )}
                    {status === "approved" && (
                      <>
                        <Btn disabled={busy === row.id} onClick={() => review(row, "approved")}>
                          Save position
                        </Btn>
                        <Btn variant="danger" disabled={busy === row.id} onClick={() => review(row, "rejected")}>
                          Take down
                        </Btn>
                      </>
                    )}
                    {status === "rejected" && (
                      <Btn disabled={busy === row.id} onClick={() => review(row, "pending")}>
                        Reconsider
                      </Btn>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toastNode}
    </div>
  );
}
