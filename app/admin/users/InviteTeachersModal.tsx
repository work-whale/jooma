"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { ADMIN_ASSIGNABLE_PLANS } from "@/app/lib/plans";
import { parseCsv } from "@/app/lib/csv";

// Sends each address a Supabase invite link by email (via SendGrid — see
// app/lib/email.ts). The link signs them in once and drops them on
// /create-password, so nobody is ever emailed a password.

const fieldClass =
  "w-full px-3.5 py-2.5 border rounded-xl bg-white text-sm font-medium placeholder-[#9A93AD] focus:outline-none focus:border-[#1D1730] transition-colors";
const fieldStyle = { borderColor: "#EAE6F5" };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Result {
  email: string;
  status: "sent" | "exists" | "failed";
  error?: string;
}

/**
 * Pull email addresses out of an uploaded CSV.
 *
 * Uses a header cell matching /e-?mail/i when there is one; otherwise picks the
 * column that looks most like emails and treats row 0 as data, so a headerless
 * export still works. Returns the count of rows it couldn't use so the admin
 * hears about them rather than silently losing addresses.
 */
function extractEmails(text: string): { emails: string[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { emails: [], skipped: 0 };

  const header = rows[0];
  let col = header.findIndex((c) => /e-?mail/i.test(c));
  let body = rows.slice(1);

  if (col === -1) {
    // No header we recognise. Score each column by how many of its cells look
    // like an address and take the best one, counting row 0 as data.
    const width = Math.max(...rows.map((r) => r.length));
    let best = -1;
    for (let i = 0; i < width; i++) {
      const hits = rows.filter((r) => EMAIL_RE.test(r[i] ?? "")).length;
      if (hits > best) {
        best = hits;
        col = i;
      }
    }
    body = rows;
    if (best === 0) return { emails: [], skipped: rows.length };
  }

  const emails: string[] = [];
  let skipped = 0;
  for (const row of body) {
    const cell = (row[col] ?? "").trim().toLowerCase();
    if (EMAIL_RE.test(cell)) emails.push(cell);
    else if (row.some((c) => c.trim() !== "")) skipped++;
  }
  return { emails, skipped };
}

export default function InviteTeachersModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  // "No plan" by default: an invitee chooses a plan and starts the trial
  // themselves, like any signup. Anything else is a comp.
  const [plan, setPlan] = useState<string>("free");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = [
    ...new Set(
      emails
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const valid = parsed.filter((e) => EMAIL_RE.test(e));
  const invalid = parsed.length - valid.length;
  const canSubmit = valid.length > 0 && !sending;

  const handleFile = async (file: File) => {
    const { emails: found, skipped } = extractEmails(await file.text());
    if (found.length === 0) {
      setNotice(`No email addresses found in ${file.name}.`);
      return;
    }
    // Appended, not replaced, and left in the textarea where it can be read and
    // edited — the admin sees exactly what will be sent before sending it.
    setEmails((prev) => (prev.trim() ? `${prev.trim()}\n${found.join("\n")}` : found.join("\n")));
    setNotice(
      `Loaded ${found.length} address${found.length === 1 ? "" : "es"} from ${file.name}` +
        (skipped > 0 ? ` — ${skipped} row${skipped === 1 ? "" : "s"} skipped.` : "."),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setNotice(null);
    setResults(null);

    const res = await fetch("/api/admin/teachers/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: valid, plan }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setNotice(json.error ?? "Could not send the invites.");
      return;
    }

    setResults(json.results ?? []);
    const sent = json.sent ?? 0;
    setNotice(
      sent === json.requested
        ? `Sent ${sent} invite${sent === 1 ? "" : "s"}.`
        : `Sent ${sent} of ${json.requested}. See below.`,
    );
    if (sent > 0) {
      setEmails("");
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[90vh]"
        style={{ borderColor: "#EAE6F5", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex items-start gap-3 p-6 pb-4 border-b shrink-0" style={{ borderColor: "#EAE6F5" }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#F1ECFC" }}
          >
            <Mail className="w-5 h-5" style={{ color: "#1D1730" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold" style={{ color: "#1D1730" }}>
              Invite teachers
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "#6D6683" }}>
              Send an invite link to one or more teachers by email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            style={{ color: "#6D6683" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                Email addresses
              </label>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={5}
                placeholder="One per line, or paste a comma-separated list"
                className={`${fieldClass} resize-none`}
                style={fieldStyle}
              />
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = "";
                }}
              />
              <p className="mt-1.5 text-xs" style={{ color: "#6D6683" }}>
                Or{" "}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="underline hover:no-underline"
                  style={{ color: "#1D1730" }}
                >
                  upload a CSV
                </button>{" "}
                — we&rsquo;ll find the email column.
                {valid.length > 0 && ` ${valid.length} address${valid.length === 1 ? "" : "es"} ready.`}
                {invalid > 0 && (
                  <span style={{ color: "#8A3C12" }}>
                    {" "}
                    {invalid} don&rsquo;t look like emails and will be skipped.
                  </span>
                )}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                Add to
              </label>
              {/* Still disabled: there are no schools in the database yet, so
                  there is nothing to assign anyone to. */}
              <select
                disabled
                title="No schools have been set up yet"
                className={`${fieldClass} opacity-50 cursor-not-allowed`}
                style={fieldStyle}
              >
                <option>No school — individual accounts</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#3C3552" }}>
                Plan
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                {/* No plan, then the plans we sell. School isn't built, so
                    inviting someone onto it would put them on a plan we can't
                    bill. */}
                {ADMIN_ASSIGNABLE_PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {results && results.length > 0 && (
              <div className="rounded-xl border divide-y" style={{ borderColor: "#EAE6F5" }}>
                {results.map((r) => (
                  <div
                    key={r.email}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                    style={{ borderColor: "#F1ECFC" }}
                  >
                    <span className="flex-1 min-w-0 truncate font-mono" style={{ color: "#1D1730" }}>
                      {r.email}
                    </span>
                    <span
                      className="font-semibold shrink-0"
                      style={{
                        color:
                          r.status === "sent" ? "#0F6E56" : r.status === "exists" ? "#6D6683" : "#B3261E",
                      }}
                      title={r.error}
                    >
                      {r.status === "sent" ? "Sent" : r.status === "exists" ? "Already has an account" : "Failed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 p-6 pt-4 border-t shrink-0"
            style={{ borderColor: "#EAE6F5" }}
          >
            <p className="text-xs" style={{ color: notice ? "#8A3C12" : "#6D6683" }}>
              {notice ?? " "}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold rounded-xl border px-4 py-2 transition-colors hover:bg-black/5"
                style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
              >
                {results ? "Done" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="text-sm font-semibold rounded-xl px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: "#5B2ED6" }}
              >
                {sending ? "Sending…" : `Send invite${valid.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
