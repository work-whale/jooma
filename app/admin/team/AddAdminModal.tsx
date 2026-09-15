"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/auth/client";
import { ADMIN_ROLES, ROLE_HINT, ROLE_LABEL } from "@/app/lib/adminRoles";
import { Btn, C, Field, Modal, inputClass, inputStyle } from "../ui";

// Promotes someone who already has a Jooma account. There is deliberately no
// "invite by email" here: an admin has to exist in auth.users first, and the
// alternative — a token in an inbox that grants console access when clicked —
// is a much larger security surface than this is worth for something that
// happens a few times a year. Someone who needs access signs up first.

interface Candidate {
  id: string;
  email: string;
  name: string | null;
}

// Super admin last: the list reads as increasing access, and the most dangerous
// choice should not be the one sitting next to the default.
const ROLE_ORDER = ["support", "finance", "marketing", "super_admin"];

const ROLES: { value: string; label: string; hint: string }[] = ROLE_ORDER.filter((r) =>
  (ADMIN_ROLES as readonly string[]).includes(r),
).map((value) => ({
  value,
  label: ROLE_LABEL[value] ?? value,
  hint: ROLE_HINT[value] ?? "",
}));

export default function AddAdminModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [role, setRole] = useState("support");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced server-side search, same shape as the audit log's filter. The
  // search runs in Postgres because the user table is unbounded and most of it
  // is irrelevant — this asks "who can I promote", not "list everyone".
  useEffect(() => {
    if (picked) return;
    const term = q.trim();
    // An empty box shows nothing rather than clearing state here — the results
    // list is only rendered when there's a term, so stale rows can't be seen.
    if (term === "") return;

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data, error: e } = await supabase.rpc("admin_searchable_users", { q: term });
      if (cancelled) return;
      setSearching(false);
      if (e) {
        setError(e.message);
        return;
      }
      setResults((data ?? []) as Candidate[]);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, picked]);

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("admin_grant_admin", {
      uid: picked.id,
      p_role: role,
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    onAdded(`${picked.email} is now an admin.`);
    onClose();
  };

  return (
    <Modal
      title="Add an admin"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={!picked || saving}>
            {saving ? "Adding…" : "Add admin"}
          </Btn>
        </>
      }
    >
      {picked ? (
        <Field label="Person">
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: C.border }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: C.ink }}>
                {picked.name ?? picked.email}
              </div>
              {picked.name && (
                <div className="font-mono text-xs" style={{ color: C.muted }}>
                  {picked.email}
                </div>
              )}
            </div>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setPicked(null);
                setQ("");
              }}
            >
              Change
            </Btn>
          </div>
        </Field>
      ) : (
        <Field
          label="Search for someone"
          help="They need a Jooma account already. If they don't have one, ask them to sign up first — then come back here."
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or email address"
            className={`${inputClass} w-full`}
            style={inputStyle}
          />

          {q.trim() !== "" && (
            <div
              className="mt-2 rounded-lg border divide-y max-h-56 overflow-y-auto"
              style={{ borderColor: C.border }}
            >
              {searching && results.length === 0 ? (
                <div className="px-3 py-2.5 text-sm" style={{ color: C.muted }}>
                  Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2.5 text-sm" style={{ color: C.muted }}>
                  Nobody matches that. They may already be an admin, or not have
                  signed up yet.
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPicked(r)}
                    className="w-full text-left px-3 py-2 hover:bg-black/5 transition-colors"
                    style={{ borderColor: C.divider }}
                  >
                    <div className="text-sm font-medium" style={{ color: C.ink }}>
                      {r.name ?? r.email}
                    </div>
                    {r.name && (
                      <div className="font-mono text-xs" style={{ color: C.muted }}>
                        {r.email}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </Field>
      )}

      <Field label="Role" help={ROLES.find((r) => r.value === role)?.hint}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`${inputClass} w-full`}
          style={inputStyle}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p className="text-sm" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
