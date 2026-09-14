"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, UserX } from "lucide-react";
import { C, Tag } from "../ui";
import { fmtRelative, nf } from "../format";

export interface IncompleteSignup {
  id: string;
  email: string;
  created_at: string;
  provider: string;
  generations: number;
}

/**
 * Accounts that signed up but never finished onboarding — no profiles row, and
 * no open invite either.
 *
 * Kept separate from both neighbouring lists because it is neither: the
 * Teachers table starts FROM profiles (so these cannot appear there without
 * reintroducing blank-named rows), and Pending invites reads the real invites
 * table (so these stopped appearing there when invites became a table). See
 * 20260914000000_admin_incomplete_signups.sql for the full history.
 *
 * Generations are shown first and sorted on: an orphan with runs against their
 * name is someone mid-use whose spending is invisible everywhere else, which is
 * the case actually worth an admin's attention. An idle sign-in is noise.
 *
 * There is no action button on purpose. The proxy now bounces these accounts to
 * /complete-profile on their next request, so the list drains itself as people
 * come back — and a name typed in by an admin would be a guess overwriting what
 * the teacher is about to enter themselves.
 */
export default function IncompleteSignups({ rows }: { rows: IncompleteSignup[] }) {
  const [open, setOpen] = useState(true);

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-2xl border overflow-hidden mb-4"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <UserX className="w-4 h-4" style={{ color: C.muted }} />
        <span className="text-sm font-semibold" style={{ color: C.ink }}>
          Incomplete signups
        </span>
        <Tag>{rows.length}</Tag>
        <span className="flex-1" />
        {open ? (
          <ChevronUp className="w-4 h-4" style={{ color: C.muted }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: C.muted }} />
        )}
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: C.divider }}>
          <p className="px-4 pt-3 text-xs" style={{ color: C.muted }}>
            Signed up but never finished the profile form, so they appear nowhere
            else in the console. They are sent back to it on their next visit.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t first:border-t-0"
                  style={{ borderColor: C.divider }}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: C.ink }}>
                    {r.email}
                  </td>
                  <td className="px-4 py-2.5 capitalize" style={{ color: C.ink2 }}>
                    <Tag>{r.provider}</Tag>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: C.ink2 }}>
                    {r.generations > 0 ? (
                      // Worth flagging: they are using the product while being
                      // invisible to every other admin screen.
                      <Tag tone="warn">
                        {nf.format(r.generations)}{" "}
                        {r.generations === 1 ? "generation" : "generations"}
                      </Tag>
                    ) : (
                      <span style={{ color: C.muted }}>No generations</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-2.5 whitespace-nowrap text-right"
                    style={{ color: C.muted }}
                  >
                    Signed up {fmtRelative(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
