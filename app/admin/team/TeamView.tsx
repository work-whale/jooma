"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import {
  ADMIN_ROLES as ROLES,
  PERMISSION_LABEL,
  PERMISSION_ORDER,
  ROLE_LABEL,
} from "@/app/lib/adminRoles";
import { fmtRelative } from "../format";
import AddAdminModal from "./AddAdminModal";
import {
  Btn,
  C,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  Modal,
  Note,
  PageHead,
  Table,
  Tag,
  Td,
  Th,
  Toggle,
  Tr,
  inputClass,
  inputStyle,
  useToast,
} from "../ui";

export interface TeamMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  last_active_at: string | null;
  is_you: boolean;
}

export interface MatrixRow {
  permission: string;
  role: string;
  allowed: boolean;
  /** True for cells that would lock everyone out of role management if
   *  switched off — currently only super_admin/manage_admins. */
  protected: boolean;
}

export default function TeamView({
  members,
  matrix,
  canManage,
}: {
  members: TeamMember[];
  matrix: MatrixRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [cellSaving, setCellSaving] = useState<string | null>(null);

  const byPermission = useMemo(() => {
    const map = new Map<string, Map<string, MatrixRow>>();
    for (const m of matrix) {
      if (!map.has(m.permission)) map.set(m.permission, new Map());
      map.get(m.permission)!.set(m.role, m);
    }
    return map;
  }, [matrix]);

  const permissions = useMemo(() => {
    const present = [...byPermission.keys()];
    const ordered = PERMISSION_ORDER.filter((p) => present.includes(p));
    return [...ordered, ...present.filter((p) => !PERMISSION_ORDER.includes(p))];
  }, [byPermission]);

  const setRole = async (userId: string, role: string, email: string) => {
    setSaving(userId);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_role", { uid: userId, p_role: role });
    setSaving(null);
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${email} is now ${ROLE_LABEL[role]}.`);
    router.refresh();
  };

  const removeAdmin = async (m: TeamMember) => {
    setSaving(m.user_id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_revoke_admin", { uid: m.user_id });
    setSaving(null);
    setRemoving(null);
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${m.email} is no longer an admin.`);
    router.refresh();
  };

  // The server refuses a protected cell too — this only keeps the UI from
  // offering a click that would always fail.
  const setPermission = async (row: MatrixRow) => {
    const key = `${row.role}.${row.permission}`;
    setCellSaving(key);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_permission", {
      p_role: row.role,
      p_permission: row.permission,
      p_allowed: !row.allowed,
    });
    setCellSaving(null);
    if (error) {
      fire(error.message);
      return;
    }
    fire(
      `${ROLE_LABEL[row.role] ?? row.role} can${row.allowed ? " no longer" : ""} ${(
        PERMISSION_LABEL[row.permission] ?? row.permission
      ).toLowerCase()}.`,
    );
    router.refresh();
  };

  return (
    <>
      <PageHead
        title="Team & roles"
        sub="Who on your side can see what. Partners, support staff and your developer shouldn't all have the same access."
      >
        {canManage && (
          <Btn variant="primary" onClick={() => setAdding(true)}>
            ✛ Add admin
          </Btn>
        )}
      </PageHead>

      {!canManage && (
        <div className="mb-4">
          <Note tone="warn">
            Your role can view the team but not change roles. Only a <b>super admin</b> can.
          </Note>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Admins</CardTitle>
          <Tag>{members.length}</Tag>
        </CardHeader>
        <Table>
          <thead>
            <tr className="text-left">
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Last active</Th>
              {canManage && <Th align="right">&nbsp;</Th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <Tr key={m.user_id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: C.ink }}>
                      {m.name ?? m.email}
                    </span>
                    {m.is_you && <Tag>you</Tag>}
                  </div>
                  {m.name && (
                    <div className="font-mono text-xs" style={{ color: C.muted }}>
                      {m.email}
                    </div>
                  )}
                </Td>
                <Td>
                  {canManage ? (
                    <select
                      value={m.role}
                      disabled={saving === m.user_id}
                      onChange={(e) => setRole(m.user_id, e.target.value, m.email)}
                      className={inputClass}
                      style={inputStyle}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Tag tone="brand">{ROLE_LABEL[m.role] ?? m.role}</Tag>
                  )}
                </Td>
                <Td>
                  <span className="text-xs" style={{ color: C.ink2 }}>
                    {fmtRelative(m.last_active_at)}
                  </span>
                </Td>
                {canManage && (
                  <Td align="right">
                    {/* No self-removal: it's the one action with no way back,
                        and the server refuses it regardless. */}
                    {!m.is_you && (
                      <Btn
                        size="sm"
                        variant="danger"
                        disabled={saving === m.user_id}
                        onClick={() => setRemoving(m)}
                      >
                        Remove
                      </Btn>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
        <CardFooter>
          Roles are an extra check on top of admin access, not a replacement — every admin
          action is still gated on being an admin first. An admin with no role assigned is
          treated as super admin. Removing someone clears both at once.
        </CardFooter>
      </Card>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>What each role can do</CardTitle>
            {canManage && <Tag tone="brand">Click to change</Tag>}
          </CardHeader>
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Permission</Th>
                {ROLES.map((r) => (
                  <Th key={r} align="center">
                    {ROLE_LABEL[r]}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <Tr key={p}>
                  <Td>
                    <span className="font-medium" style={{ color: C.ink }}>
                      {PERMISSION_LABEL[p] ?? p}
                    </span>
                  </Td>
                  {ROLES.map((r) => {
                    const cell = byPermission.get(p)?.get(r);
                    const allowed = cell?.allowed ?? false;

                    if (!canManage || !cell) {
                      return (
                        <Td key={r} align="center">
                          <span
                            className="font-bold"
                            style={{ color: allowed ? C.ok : C.muted }}
                            title={allowed ? "Allowed" : "Not allowed"}
                          >
                            {allowed ? "✓" : "—"}
                          </span>
                        </Td>
                      );
                    }

                    // A protected cell renders as a padlock rather than a
                    // disabled switch: it isn't "temporarily unavailable", it
                    // is deliberately fixed, and the tooltip says why.
                    if (cell.protected) {
                      return (
                        <Td key={r} align="center">
                          <span
                            title="Super admins must keep this, or nobody could manage roles again."
                            style={{ color: C.ink2 }}
                          >
                            🔒
                          </span>
                        </Td>
                      );
                    }

                    return (
                      <Td key={r} align="center">
                        <div className="flex justify-center">
                          <Toggle
                            on={allowed}
                            disabled={cellSaving === `${r}.${p}`}
                            onChange={() => setPermission(cell)}
                            label={`${ROLE_LABEL[r] ?? r}: ${PERMISSION_LABEL[p] ?? p}`}
                          />
                        </div>
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </tbody>
          </Table>
          <CardFooter>
            Enforced in the database, not just hidden in the UI — a role that can&apos;t issue
            refunds is refused by the server even if the request is made directly. Changes
            apply the next time that person loads a page.
          </CardFooter>
        </Card>
      </div>

      {adding && (
        <AddAdminModal
          onClose={() => setAdding(false)}
          onAdded={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}

      {removing && (
        <Modal
          title="Remove this admin?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Btn onClick={() => setRemoving(null)}>Cancel</Btn>
              <Btn
                variant="danger"
                disabled={saving === removing.user_id}
                onClick={() => removeAdmin(removing)}
              >
                {saving === removing.user_id ? "Removing…" : "Remove admin"}
              </Btn>
            </>
          }
        >
          <p className="text-sm" style={{ color: C.ink }}>
            <b>{removing.name ?? removing.email}</b> will lose access to this console
            immediately. Their Jooma account and everything they&apos;ve made stays exactly
            as it is — only the admin access goes.
          </p>
          <p className="text-sm mt-2.5" style={{ color: C.muted }}>
            You can add them back at any time.
          </p>
        </Modal>
      )}

      {toastNode}
    </>
  );
}
