"use client";

// The support ticket composer.
//
// Extracted from HelpView so /profile's "Submit ticket" section can render the
// same form. It is deliberately ONE component rather than two similar ones: the
// RPC behind it (my_create_thread) enforces length limits, a cap of ten open
// threads per teacher, and plan-based priority, and a second copy of this form
// is a second place for those assumptions to rot.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";

// The categories from the Figma, and a short list of common subjects under each.
//
// support_threads has no category column and my_create_thread takes only a
// subject and a body, so the choice is folded into the subject line
// ("Billing & Subscription — Payment failed"). That lands in the admin inbox as
// searchable text and reads correctly in the reply email, which a separate
// column would not without touching both. If categories ever need to be filtered
// or reported on, that is the point to add the column.
export const TICKET_CATEGORIES = [
  {
    id: "account",
    label: "Account & Login",
    subjects: [
      "Can't log in",
      "Forgot password",
      "Account verification issue",
      "Profile settings problem",
    ],
  },
  {
    id: "billing",
    label: "Billing & Subscription",
    subjects: [
      "Payment failed",
      "Subscription not active",
      "Cancel subscription",
      "Refund request",
      "Invoice needed",
    ],
  },
  {
    id: "content",
    label: "Content Generation",
    subjects: [
      "Content not generating",
      "Wrong curriculum or level",
      "Editing not working",
      "Saved content missing",
    ],
  },
  {
    id: "technical",
    label: "Technical Issue",
    subjects: ["App crash", "Something isn't working", "Performance issue", "Upload failed"],
  },
  {
    id: "feature",
    label: "Feature Request",
    subjects: ["Suggest a new feature", "Improvement idea"],
  },
  {
    id: "other",
    label: "Other",
    subjects: ["General question", "Something else"],
  },
] as const;

const OTHER_SUBJECT = "Something else";

const SELECT_CLASS =
  "w-full px-3.5 py-2.5 border rounded-2xl bg-white text-sm focus:outline-none focus:border-gray-400 transition-colors";

export default function NewConversation({
  onCancel,
  onCreated,
  /** /profile heads its own card, so the built-in heading would be the second
   *  one on the page. Default true for /help, which has no other. */
  heading = true,
}: {
  onCancel?: () => void;
  onCreated: (id: string) => void;
  heading?: boolean;
}) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [subject, setSubject] = useState("");
  // Only used when the chosen subject is the free-text escape hatch.
  const [customSubject, setCustomSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = TICKET_CATEGORIES.find((c) => c.id === categoryId) ?? null;
  const needsCustom = subject === OTHER_SUBJECT;
  const effectiveSubject = needsCustom ? customSubject.trim() : subject;

  // "Billing & Subscription — Payment failed". Capped at 200 to match the
  // column, with the category kept and the tail trimmed: the prefix is the part
  // support triages on.
  const composedSubject = category
    ? `${category.label}: ${effectiveSubject}`.slice(0, 200)
    : effectiveSubject.slice(0, 200);

  const ready = category !== null && effectiveSubject !== "" && body.trim() !== "";

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: e } = await supabase.rpc("my_create_thread", {
      p_subject: composedSubject,
      p_body: body.trim(),
    });
    setBusy(false);
    if (e) {
      // Surfaced verbatim: my_create_thread raises readable messages for the
      // ten-open-thread cap and the length limits, and rewriting them here would
      // turn "you have too many open conversations" into something vaguer.
      setError(e.message);
      return;
    }
    onCreated(data as string);
  };

  return (
    <div className="max-w-xl">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-dark transition-colors mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      )}
      {heading && (
        <>
          <h3 className="text-xl font-medium mb-1">How can we help?</h3>
          <p className="text-sm text-muted font-light mb-5">
            Tell us what happened and we&apos;ll get back to you, usually within
            a working day.
          </p>
        </>
      )}

      {error && (
        <p className="text-sm mb-3" style={{ color: "#B3261E" }}>
          {error}
        </p>
      )}

      <label htmlFor="ticket-category" className="block text-sm font-medium mb-1.5">
        Issue category
      </label>
      <select
        id="ticket-category"
        value={categoryId}
        onChange={(e) => {
          setCategoryId(e.target.value);
          // The subject list depends on the category, so a stale pick from the
          // previous one has to go.
          setSubject("");
          setCustomSubject("");
        }}
        className={`${SELECT_CLASS} mb-4`}
        style={{ borderColor: "var(--j-line)" }}
      >
        <option value="">Select a category</option>
        {TICKET_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <label htmlFor="ticket-subject" className="block text-sm font-medium mb-1.5">
        Subject
      </label>
      <select
        id="ticket-subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={!category}
        className={`${SELECT_CLASS} mb-4 disabled:bg-(--j-tint) disabled:text-(--j-faint) disabled:cursor-not-allowed`}
        style={{ borderColor: "var(--j-line)" }}
      >
        <option value="">
          {category ? "Select a subject" : "Choose a category first"}
        </option>
        {category?.subjects.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {/* Every category needs a way out, or a teacher whose problem isn't on
            the list has nowhere to put it. */}
        {category && !category.subjects.includes(OTHER_SUBJECT as never) && (
          <option value={OTHER_SUBJECT}>{OTHER_SUBJECT}</option>
        )}
      </select>

      {needsCustom && (
        <input
          value={customSubject}
          onChange={(e) => setCustomSubject(e.target.value)}
          maxLength={150}
          placeholder="Ran out of resources mid-lesson"
          aria-label="Describe your issue in a few words"
          className="w-full px-3.5 py-2.5 border rounded-2xl bg-white text-sm mb-4 focus:outline-none focus:border-gray-400 transition-colors"
          style={{ borderColor: "var(--j-line)" }}
        />
      )}

      <label htmlFor="ticket-body" className="block text-sm font-medium mb-1.5">
        Description
      </label>
      <textarea
        id="ticket-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        maxLength={5000}
        placeholder="What were you trying to do, and what happened instead?"
        className="w-full px-3.5 py-2.5 border rounded-2xl bg-white text-sm resize-none mb-4 focus:outline-none focus:border-gray-400 transition-colors"
        style={{ borderColor: "var(--j-line)" }}
      />

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !ready}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        style={{ backgroundColor: "var(--j-purple)" }}
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}
