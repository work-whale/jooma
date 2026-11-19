"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { Btn, C, Note, inputClass, inputStyle } from "../ui";

/*
 * The E10 idea list (lifecycle_ideas, kind 'e10'). One idea a UK week, in
 * order, wrapping. While the list is empty the email uses the defaults in
 * app/lib/e10-ideas.ts; "Start from the defaults" copies them in to edit.
 * Writes go through the teacher's own session: the table's policy allows
 * admins only.
 */

export interface IdeaRow {
  id: string;
  text: string;
  tool_slug: string;
  sort: number;
  active: boolean;
}

export default function IdeasEditor({
  initial,
  defaults,
}: {
  initial: IdeaRow[];
  defaults: { text: string; tool_slug: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [slug, setSlug] = useState("quiz-generator");

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(e.message);
    else router.refresh();
  };
  const db = () => createClient().from("lifecycle_ideas");
  const nextSort = (initial.at(-1)?.sort ?? 0) + 10;

  return (
    <div className="grid gap-3">
      <p className="text-sm" style={{ color: C.muted }}>
        Reads after &quot;Here&apos;s a quick one for this week:&quot;, so start lower case with no full stop. The
        button opens the tool; the email shows that tool&apos;s usual cost.
      </p>
      {initial.length === 0 ? (
        <>
          <Note>The list is empty, so E10 uses these defaults:</Note>
          <ol className="text-sm list-decimal pl-5" style={{ color: C.ink }}>
            {defaults.map((d) => (
              <li key={d.text}>
                {d.text} <span style={{ color: C.muted }}>({d.tool_slug})</span>
              </li>
            ))}
          </ol>
          <div>
            <Btn
              disabled={busy}
              onClick={() =>
                void run(() => db().insert(defaults.map((d, i) => ({ kind: "e10", text: d.text, tool_slug: d.tool_slug, sort: (i + 1) * 10 }))))
              }
            >
              Start from the defaults
            </Btn>
          </div>
        </>
      ) : (
        <ol className="grid gap-2" data-testid="e10-ideas">
          {initial.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm flex-wrap" style={{ color: r.active ? C.ink : C.muted }}>
              <span className="flex-1 min-w-[12rem]">
                {r.text} <span style={{ color: C.muted }}>({r.tool_slug})</span>
              </span>
              <Btn size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => db().update({ active: !r.active }).eq("id", r.id))}>
                {r.active ? "Pause" : "Use"}
              </Btn>
              <Btn size="sm" variant="danger" disabled={busy} onClick={() => void run(() => db().delete().eq("id", r.id))}>
                Remove
              </Btn>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          className={`${inputClass} flex-1 min-w-[14rem]`}
          style={inputStyle}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="a spelling test on this week's words"
          maxLength={200}
          aria-label="New idea"
        />
        <input
          className={inputClass}
          style={inputStyle}
          value={slug}
          onChange={(e) => setSlug(e.target.value.trim())}
          placeholder="tool slug"
          aria-label="Tool slug"
        />
        <Btn
          variant="primary"
          disabled={busy || text.trim().length < 3 || !/^[a-z0-9-]{2,60}$/.test(slug)}
          onClick={() =>
            void run(async () => {
              const r = await db().insert({ kind: "e10", text: text.trim().replace(/\.$/, ""), tool_slug: slug, sort: nextSort });
              if (!r.error) setText("");
              return r;
            })
          }
        >
          Add idea
        </Btn>
      </div>
      {error && <Note tone="danger">{error}</Note>}
    </div>
  );
}
