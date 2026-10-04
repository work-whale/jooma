"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { usePermissions } from "./usePermissions";
import { asPlanId } from "@/app/lib/plans";
import { planCardName } from "@/app/lib/plan-copy";
import { C, PLAN_TONE, Tag } from "../ui";
import { fmtRelative } from "../format";

export interface PendingInvite {
  id: string;
  email: string;
  invited_at: string;
  invited_plan: string | null;
  expires_at: string;
}

/**
 * Teachers who were invited but haven't finished onboarding yet (no profiles
 * row — see admin_pending_invites()). Kept separate from the main table so an
 * invite-in-flight never reads as a real, blank-named account.
 */
export default function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const [open, setOpen] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { can } = usePermissions();

  if (invites.length === 0) return null;

  const revoke = async (invite: PendingInvite) => {
    if (!confirm(`Revoke the invite for ${invite.email}? They'll need a new invite to join.`)) return;
    setRevoking(invite.id);
    setError(null);
    const res = await fetch("/api/admin/teachers/revoke-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId: invite.id }),
    });
    setRevoking(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not revoke the invite.");
      return;
    }
    router.refresh();
  };

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
        <Mail className="w-4 h-4" style={{ color: C.muted }} />
        <span className="text-sm font-semibold" style={{ color: C.ink }}>
          Pending invites
        </span>
        <Tag>{invites.length}</Tag>
        <span className="flex-1" />
        {open ? (
          <ChevronUp className="w-4 h-4" style={{ color: C.muted }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: C.muted }} />
        )}
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: C.divider }}>
          {error && (
            <p className="px-4 pt-3 text-xs" style={{ color: C.danger }}>
              {error}
            </p>
          )}
          <table className="w-full text-sm">
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-t first:border-t-0" style={{ borderColor: C.divider }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: C.ink }}>
                    {inv.email}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: C.ink2 }}>
                    <Tag tone={PLAN_TONE[inv.invited_plan ?? "free"] ?? "plain"}>
                      {planCardName(asPlanId(inv.invited_plan))}
                    </Tag>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: C.muted }}>
                    {new Date(inv.expires_at).getTime() < Date.now() ? (
                      // An expired link can't be accepted, so say so rather
                      // than leaving the admin to wonder why nothing happened.
                      <span style={{ color: C.danger }}>
                        Expired — invited {fmtRelative(inv.invited_at)}
                      </span>
                    ) : (
                      <>Invited {fmtRelative(inv.invited_at)}</>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={!can("invite_teachers") || revoking === inv.id}
                      title={can("invite_teachers") ? undefined : "Your admin role can't manage invites"}
                      onClick={() => revoke(inv)}
                      className="text-xs font-semibold rounded-lg border px-2.5 py-1 transition-colors hover:bg-black/5 disabled:opacity-40"
                      style={{ borderColor: C.border, color: C.danger }}
                    >
                      {revoking === inv.id ? "Revoking…" : "Revoke"}
                    </button>
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
