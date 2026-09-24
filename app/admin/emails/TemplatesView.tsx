"use client";

// Reusable bulk email templates, and the automatic signup reminders that send
// from them. The system emails (invites, resets) sit below this on the same tab,
// rendered by SystemEmails for roles that can see them.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import {
  EMPTY_CONTENT,
  PURPOSE_LABEL,
  contentFromRow,
  contentToRow,
  type BroadcastContent,
  type Purpose,
} from "@/app/lib/email-templates/broadcast";
import { fmtDate } from "../format";
import {
  Btn,
  C,
  Card,
  EmptyState,
  Field,
  Modal,
  Note,
  Table,
  Tag,
  Td,
  Th,
  Toggle,
  Tr,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";
import BroadcastFields, { PurposePicker } from "./BroadcastFields";
import BroadcastPreview from "./BroadcastPreview";
import type { AutomationRow, BroadcastTemplate } from "./types";

export default function TemplatesView({
  templates,
  automations,
}: {
  templates: BroadcastTemplate[];
  automations: AutomationRow[];
}) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [editing, setEditing] = useState<BroadcastTemplate | "new" | null>(null);

  const archive = async (t: BroadcastTemplate) => {
    const { error } = await createClient().rpc("admin_archive_broadcast_template", { p_id: t.id });
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${t.name} archived.`);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold" style={{ color: C.ink }}>
              Bulk email templates
            </h2>
            <p className="text-sm" style={{ color: C.muted }}>
              Starting points for marketing, reminders, updates and notices.
            </p>
          </div>
          <Btn variant="primary" onClick={() => setEditing("new")}>
            New template
          </Btn>
        </div>
        <Card>
          {templates.length === 0 ? (
            <EmptyState title="No templates yet" />
          ) : (
            <Table>
              <thead>
                <tr className="text-left">
                  <Th>Template</Th>
                  <Th>Kind</Th>
                  <Th>Subject</Th>
                  <Th>Updated</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <span className="font-semibold" style={{ color: C.ink }}>
                        {t.name}
                      </span>
                    </Td>
                    <Td>
                      <Tag>{PURPOSE_LABEL[t.purpose as Purpose] ?? t.purpose}</Tag>
                    </Td>
                    <Td>
                      <span className="text-sm" style={{ color: t.subject ? C.ink : C.muted }}>
                        {t.subject || "Not written"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {fmtDate(t.updated_at)}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/admin/emails?tab=compose&template=${t.id}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-black/5"
                          style={{ borderColor: C.border, color: C.ink }}
                          aria-label={`Use ${t.name}`}
                        >
                          Use
                        </Link>
                        <Btn size="sm" onClick={() => setEditing(t)}>
                          Edit
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => archive(t)}>
                          Archive
                        </Btn>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </section>

      <Automations
        automations={automations}
        templates={templates}
        onChanged={(m) => {
          fire(m);
          router.refresh();
        }}
        onError={fire}
      />

      {editing && (
        <TemplateModal
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            fire(`${name} saved.`);
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </div>
  );
}

function Automations({
  automations,
  templates,
  onChanged,
  onError,
}: {
  automations: AutomationRow[];
  templates: BroadcastTemplate[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const update = async (a: AutomationRow, payload: Record<string, unknown>, msg: string) => {
    const { error } = await createClient().rpc("admin_update_email_automation", {
      p_key: a.key,
      payload,
    });
    if (error) onError(error.message);
    else onChanged(msg);
  };

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: C.ink }}>
          Automatic signup reminders
        </h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Sent on their own, once a day at midnight, to people who created an account but
          never finished their profile. Each person gets each reminder once, and someone
          who signed up more than three days before the reminder was due is never caught
          up on it.
        </p>
      </div>
      <Card>
        {automations.length === 0 ? (
          <EmptyState title="No automatic emails" />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Reminder</Th>
                <Th>Template</Th>
                <Th>Send after</Th>
                <Th align="center">On</Th>
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => (
                <Tr key={a.key}>
                  <Td>
                    <div className="font-semibold" style={{ color: C.ink }}>
                      {a.name}
                    </div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {a.description}
                    </div>
                  </Td>
                  <Td>
                    <select
                      aria-label={`${a.name} template`}
                      value={a.template_id ?? ""}
                      onChange={(e) =>
                        update(a, { template_id: e.target.value || null }, `${a.name} template changed.`)
                      }
                      className={fieldClass}
                      style={fieldStyle}
                    >
                      <option value="">Choose a template</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <DelayInput
                      // Remounts after a save lands, so the box shows the stored value.
                      key={a.delay_hours}
                      hours={a.delay_hours}
                      label={a.name}
                      onSave={(h) => update(a, { delay_hours: h }, `${a.name} delay saved.`)}
                    />
                  </Td>
                  <Td align="center">
                    <div className="flex justify-center">
                      <Toggle
                        on={a.live}
                        label={`${a.name} on`}
                        onChange={(next) =>
                          update(a, { live: next }, `${a.name} ${next ? "turned on" : "turned off"}.`)
                        }
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </section>
  );
}

function DelayInput({
  hours,
  label,
  onSave,
}: {
  hours: number;
  label: string;
  onSave: (hours: number) => void;
}) {
  const [value, setValue] = useState(String(hours));
  const commit = () => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 2160) {
      setValue(String(hours));
      return;
    }
    if (n !== hours) onSave(n);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={2160}
        aria-label={`${label} delay in hours`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        className={`${fieldClass} w-24!`}
        style={fieldStyle}
      />
      <span className="text-xs whitespace-nowrap" style={{ color: C.muted }}>
        hours{hours >= 24 && hours % 24 === 0 ? ` (${hours / 24} day${hours === 24 ? "" : "s"})` : ""}
      </span>
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: BroadcastTemplate | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [purpose, setPurpose] = useState<Purpose>((template?.purpose as Purpose) ?? "marketing");
  const [content, setContent] = useState<BroadcastContent>(
    template ? contentFromRow(template) : EMPTY_CONTENT,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: e } = await createClient().rpc("admin_upsert_broadcast_template", {
      payload: { id: template?.id ?? null, name, purpose, ...contentToRow(content) },
    });
    setSaving(false);
    if (e) setError(e.message);
    else onSaved(name.trim());
  };

  return (
    <Modal
      title={template ? `Edit ${template.name}` : "New template"}
      onClose={onClose}
      width="max-w-6xl"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save template"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <Field label="Template name">
            <input
              aria-label="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              style={fieldStyle}
              maxLength={120}
            />
          </Field>
          <PurposePicker value={purpose} onChange={setPurpose} />
          <BroadcastFields value={content} onChange={setContent} />
          {error && (
            <div className="mt-2">
              <Note tone="danger">{error}</Note>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <BroadcastPreview content={content} purpose={purpose} height={520} />
        </div>
      </div>
    </Modal>
  );
}
