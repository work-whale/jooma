"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardFooter,
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
import EmailPreview from "./EmailPreview";
import { SAMPLE_PARAMS } from "@/app/lib/email-templates/samples";
import type { EmailTemplateKey } from "@/app/lib/email-templates";

/** The {{placeholders}} this template can use, taken from the values its real
 *  trigger passes. Listing the actual names beats a generic sentence about
 *  curly braces. */
function placeholderHint(key: string): string {
  const params = SAMPLE_PARAMS[key as EmailTemplateKey];
  if (!params) return "";
  return Object.keys(params)
    .map((p) => `{{${p}}}`)
    .join(", ");
}

export interface EmailTemplate {
  key: string;
  name: string;
  trigger_description: string;
  subject: string | null;
  body: string | null;
  live: boolean;
  sent_30d: number | null;
  open_rate: number | null;
  click_rate: number | null;
}

/** The automatic transactional emails (invites, password resets, deletion
 *  notices). Formerly the whole of /admin/emails; now the System emails part
 *  of its Templates tab, shown only to roles holding see_content. */
export default function SystemEmails({
  rows,
  mailerReady,
  renderableKeys,
}: {
  rows: EmailTemplate[];
  /** SendGrid keys present — i.e. anything can send at all. */
  mailerReady: boolean;
  /** Keys with a renderer in app/lib/email-templates. A row without one is a
   *  wording record and nothing more, however live it claims to be. */
  renderableKeys: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [toastNode, fire] = useToast();

  const renderable = new Set(renderableKeys);
  const orphans = rows.filter((r) => !renderable.has(r.key));

  const toggleLive = async (key: string, live: boolean, name: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_update_email_template", {
      p_key: key,
      payload: { live },
    });
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${name} ${live ? "enabled" : "turned off"}.`);
    router.refresh();
  };

  // Engagement columns appear only once there is real data behind them. Nothing
  // writes sent_30d/open_rate yet — that needs SendGrid's event webhook — so
  // rather than render invented open rates the columns are omitted entirely.
  const hasStats = rows.some((r) => r.sent_30d !== null);

  return (
    <>
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: C.ink }}>
          System emails
        </h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Every automatic email Jooma sends. Edit the wording and control which are active.
        </p>
      </div>

      <div className="mb-4 space-y-2">
        {!mailerReady ? (
          <Note tone="warn">
            <b>No email provider is configured</b> — SENDGRID_API_KEY and
            SENDGRID_FROM_EMAIL are not both set in this environment, so nothing sends
            here. Wording saved on this page still applies once they are.
          </Note>
        ) : (
          <Note>
            <b>SendGrid is configured</b>, so the templates below with a renderer send for
            real. Turning one off here stops it immediately.
          </Note>
        )}
        {orphans.length > 0 && (
          <Note tone="warn">
            <b>
              {orphans.length} of these {rows.length} have nothing to trigger them yet
            </b>{" "}
            — {orphans.map((o) => o.name).join(", ")}. Their wording is saved for
            whenever the feature that sends them gets built, and they are marked{" "}
            <b>Not sending</b> below.
          </Note>
        )}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No templates" />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Template</Th>
                <Th>Sent when</Th>
                <Th>Subject</Th>
                {hasStats && (
                  <>
                    <Th align="right">Sent (30d)</Th>
                    <Th align="right">Opened</Th>
                  </>
                )}
                <Th align="center">Live</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Tr key={t.key}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold" style={{ color: C.ink }}>
                        {t.name}
                      </span>
                      {!renderable.has(t.key) && (
                        <Tag
                          tone="warn"
                          title="Nothing in the code triggers this yet, so it cannot send whatever the Live switch says"
                        >
                          Not sending
                        </Tag>
                      )}
                    </div>
                    <div className="font-mono text-xs" style={{ color: C.muted }}>
                      {t.key}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-xs" style={{ color: C.ink2 }}>
                      {t.trigger_description}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm" style={{ color: t.subject ? C.ink : C.muted }}>
                      {t.subject ?? "Not written"}
                    </span>
                  </Td>
                  {hasStats && (
                    <>
                      <Td align="right" mono>
                        {t.sent_30d === null ? "—" : nf.format(Number(t.sent_30d))}
                      </Td>
                      <Td align="right" mono>
                        {t.open_rate === null ? "—" : `${Number(t.open_rate).toFixed(0)}%`}
                      </Td>
                    </>
                  )}
                  <Td align="center">
                    <div className="flex justify-center">
                      <Toggle
                        on={t.live}
                        onChange={(next) => toggleLive(t.key, next, t.name)}
                        label={t.name}
                      />
                    </div>
                  </Td>
                  <Td align="right">
                    <Btn size="sm" onClick={() => setEditing(t)}>
                      Edit
                    </Btn>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardFooter>
          {nf.format(rows.length)} templates ·{" "}
          {nf.format(rows.filter((r) => r.live).length)} marked live
        </CardFooter>
      </Card>

      {editing && (
        <EditEmailModal
          template={editing}
          sends={mailerReady && renderable.has(editing.key)}
          renderable={renderable.has(editing.key)}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function EditEmailModal({
  template,
  sends,
  renderable,
  onClose,
  onSaved,
}: {
  template: EmailTemplate;
  /** Provider configured AND this template has a renderer. */
  sends: boolean;
  /** Whether a renderer exists — drives whether a preview is possible at all. */
  renderable: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("admin_update_email_template", {
      p_key: template.key,
      payload: { subject, body },
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    onSaved(`${template.name} saved.`);
    onClose();
  };

  return (
    <Modal
      title={`Edit ${template.name}`}
      onClose={onClose}
      // Wide enough for the two email frames side by side.
      width="max-w-4xl"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save template"}
          </Btn>
        </>
      }
    >
      <Field label="Sent when">
        <p className="text-sm" style={{ color: C.ink2 }}>
          {template.trigger_description}
        </p>
      </Field>

      <Field
        label="Subject"
        help={
          placeholderHint(template.key)
            ? `Placeholders: ${placeholderHint(template.key)}`
            : undefined
        }
      >
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>

      <Field
        label="Body"
        help={`Replaces the opening paragraphs only — the heading, button and footer stay as designed. Leave blank to use the wording in the code.${
          placeholderHint(template.key)
            ? ` Placeholders: ${placeholderHint(template.key)}`
            : ""
        }`}
      >
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave blank to keep the built-in wording."
          className={`${fieldClass} resize-none`}
          style={fieldStyle}
        />
      </Field>

      <EmailPreview
        templateKey={template.key}
        subject={subject}
        body={body}
        savedSubject={template.subject}
        savedBody={template.body}
        renderable={renderable}
      />

      <div className="mt-3">
        <Note tone={sends ? "warn" : "brand"}>
          {sends
            ? "This template sends for real. Saving changes the wording of the next one that goes out."
            : "Saving records the wording. This template has nothing to trigger it yet, so it won't send."}
        </Note>
      </div>

      {error && (
        <p className="text-sm mt-2" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
