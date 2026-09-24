"use client";

// Write a bulk email, see it, test it, and send it. Manual sends go out when
// the admin presses Send now; there is no scheduling.
//
// The browser never sees a recipient address. It sees counts (from
// admin_email_audience_counts) and progress numbers (from the send route); the
// addresses stay in the database and the service-role routes. That is what
// lets the marketing role use this tab at all.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import {
  AUDIENCES,
  AUDIENCE_HINT,
  AUDIENCE_LABEL,
  EMPTY_CONTENT,
  PURPOSE_LABEL,
  contentFromRow,
  contentToRow,
  parseEmailList,
  respectsOptOut,
  validateBroadcast,
  type AudienceKind,
  type BroadcastContent,
  type Purpose,
} from "@/app/lib/email-templates/broadcast";
import { nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Modal,
  Note,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";
import BroadcastFields, { PurposePicker } from "./BroadcastFields";
import BroadcastPreview from "./BroadcastPreview";
import { drainCampaign, type Progress } from "./drain";
import type { BroadcastTemplate } from "./types";

type Counts = Record<Exclude<AudienceKind, "emails">, number> & { opted_out: number };

export default function ComposeView({
  templates,
  initialTemplateId,
  mailerReady,
}: {
  templates: BroadcastTemplate[];
  initialTemplateId: string | null;
  mailerReady: boolean;
}) {
  const router = useRouter();
  const [toastNode, fire] = useToast();

  const initial = templates.find((t) => t.id === initialTemplateId) ?? null;
  const [templateId, setTemplateId] = useState<string>(initial?.id ?? "");
  const [purpose, setPurpose] = useState<Purpose>((initial?.purpose as Purpose) ?? "marketing");
  const [content, setContent] = useState<BroadcastContent>(
    initial ? contentFromRow(initial) : EMPTY_CONTENT,
  );

  const [audience, setAudience] = useState<AudienceKind>(
    initial?.purpose === "signup_reminder" ? "incomplete_signups" : "all_teachers",
  );
  const [emailsText, setEmailsText] = useState("");
  const emails = useMemo(() => parseEmailList(emailsText), [emailsText]);

  const [counts, setCounts] = useState<Counts | null>(null);
  const [emailsCount, setEmailsCount] = useState<number | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audience sizes depend on the purpose, because opt-outs do: a service
  // notice reaches people a marketing email skips.
  useEffect(() => {
    let live = true;
    createClient()
      .rpc("admin_email_audience_counts", { p_purpose: purpose })
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError(e.message);
        else setCounts(data as Counts);
      });
    return () => {
      live = false;
    };
  }, [purpose]);

  // Typed addresses: count how many are real, reachable accounts. Debounced,
  // because the list is usually pasted in pieces.
  useEffect(() => {
    if (audience !== "emails" || emails.length === 0) return;
    let live = true;
    const timer = setTimeout(() => {
      createClient()
        .rpc("admin_email_audience_count", {
          p_audience: { kind: "emails", emails },
          p_purpose: purpose,
        })
        .then(({ data }) => {
          if (live) setEmailsCount(typeof data === "number" ? data : null);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [audience, emails, purpose]);

  const recipientCount =
    audience === "emails"
      ? emails.length === 0
        ? 0
        : emailsCount
      : counts
        ? counts[audience]
        : null;

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setContent(EMPTY_CONTENT);
      return;
    }
    setContent(contentFromRow(t));
    setPurpose(t.purpose as Purpose);
    if (t.purpose === "signup_reminder") setAudience("incomplete_signups");
  };

  const problem = validateBroadcast(content);
  const tooMany = audience === "emails" && emails.length > 50;

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emails/broadcast/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, content }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string; to?: string };
      if (!res.ok) setError(body.error ?? "The test did not send.");
      else if (body.status === "skipped") fire(`${body.to} is a test address, so nothing was delivered.`);
      else fire(`Test sent to ${body.to}.`);
    } finally {
      setTesting(false);
    }
  };

  const saveAsTemplate = async (name: string) => {
    const { data, error: e } = await createClient().rpc("admin_upsert_broadcast_template", {
      payload: { name, purpose, ...contentToRow(content) },
    });
    if (e) return e.message;
    setTemplateId(String(data));
    fire(`Saved as "${name}".`);
    router.refresh();
    return null;
  };

  const send = async () => {
    setError(null);
    const res = await fetch("/api/admin/emails/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose,
        templateId: templateId || null,
        content,
        audience: audience === "emails" ? { kind: "emails", emails } : { kind: audience },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      id?: string;
      status?: string;
      recipients?: number | null;
    };
    setConfirming(false);
    if (!res.ok || !body.id) {
      setError(body.error ?? "Could not send.");
      return;
    }

    // Drain it batch by batch so the bar moves. If this tab is closed, the rest
    // waits for Resume sending in History.
    const recipients = body.recipients ?? 0;
    setProgress({ status: body.status ?? "sending", recipients, sent: 0, failed: 0, skipped: 0, pending: recipients });
    if (body.status === "sending") {
      const result = await drainCampaign(body.id, setProgress);
      if (result.error) setError(result.error);
    }
    router.refresh();
  };

  if (progress) {
    return (
      <SendProgress
        progress={progress}
        error={error}
        onAnother={() => {
          setProgress(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <>
      {!mailerReady && (
        <div className="mb-4">
          <Note tone="warn">
            <b>No email provider is configured here.</b> SENDGRID_API_KEY and
            SENDGRID_FROM_EMAIL are not both set, so tests and sends will be refused.
          </Note>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>1. Write it</CardTitle>
            </CardHeader>
            <CardBody>
              <Field label="Start from">
                <select
                  aria-label="Start from"
                  value={templateId}
                  onChange={(e) => pickTemplate(e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                >
                  <option value="">Blank email</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({PURPOSE_LABEL[t.purpose as Purpose] ?? t.purpose})
                    </option>
                  ))}
                </select>
              </Field>
              <PurposePicker value={purpose} onChange={setPurpose} />
              <BroadcastFields value={content} onChange={setContent} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Choose who gets it</CardTitle>
              {counts && respectsOptOut(purpose) && counts.opted_out > 0 && (
                <span className="text-xs" style={{ color: C.muted }}>
                  {nf.format(counts.opted_out)} unsubscribed, left out
                </span>
              )}
            </CardHeader>
            <CardBody>
              <div role="radiogroup" aria-label="Audience" className="space-y-1.5">
                {AUDIENCES.map((kind) => {
                  const n = kind === "emails" ? null : counts?.[kind];
                  return (
                    <label
                      key={kind}
                      className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer"
                      style={{
                        borderColor: audience === kind ? C.brand : C.border,
                        backgroundColor: audience === kind ? C.brandBg : C.surface,
                      }}
                    >
                      <input
                        type="radio"
                        name="audience"
                        value={kind}
                        checked={audience === kind}
                        onChange={() => setAudience(kind)}
                        className="mt-1"
                        aria-label={AUDIENCE_LABEL[kind]}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: C.ink }}>
                          {AUDIENCE_LABEL[kind]}
                        </span>
                        <span className="block text-xs" style={{ color: C.muted }}>
                          {AUDIENCE_HINT[kind]}
                        </span>
                      </span>
                      {kind !== "emails" && (
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: C.ink2 }}
                          data-testid={`count-${kind}`}
                        >
                          {n == null ? "..." : nf.format(n)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {audience === "emails" && (
                <div className="mt-3">
                  <Field
                    label="Addresses"
                    help={
                      emails.length === 0
                        ? "Paste addresses separated by commas or new lines."
                        : `${emails.length} address${emails.length === 1 ? "" : "es"}` +
                          (emailsCount === null ? "" : `, ${emailsCount} with a reachable Jooma account.`)
                    }
                  >
                    <textarea
                      aria-label="Addresses"
                      rows={3}
                      value={emailsText}
                      onChange={(e) => setEmailsText(e.target.value)}
                      className={`${fieldClass} font-normal`}
                      style={fieldStyle}
                    />
                  </Field>
                  {tooMany && <Note tone="warn">Up to 50 addresses at a time.</Note>}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Send it</CardTitle>
            </CardHeader>
            <CardBody>
              {problem && (
                <p className="text-xs mb-3" style={{ color: C.muted }}>
                  {problem}
                </p>
              )}
              {error && (
                <div className="mb-3">
                  <Note tone="danger">{error}</Note>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Btn onClick={sendTest} disabled={!!problem || testing || !mailerReady}>
                  {testing ? "Sending test..." : "Send test to me"}
                </Btn>
                <Btn onClick={() => setSavingTemplate(true)} disabled={!content.subject.trim() && !content.body.trim()}>
                  Save as template
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => setConfirming(true)}
                  disabled={!!problem || tooMany || !recipientCount || !mailerReady}
                >
                  Send now
                </Btn>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardBody>
              <BroadcastPreview content={content} purpose={purpose} />
            </CardBody>
          </Card>
        </div>
      </div>

      {confirming && (
        <ConfirmSend
          purpose={purpose}
          audienceLabel={AUDIENCE_LABEL[audience]}
          count={recipientCount ?? 0}
          subject={content.subject}
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        />
      )}
      {savingTemplate && (
        <SaveTemplateModal
          defaultName={content.subject}
          onCancel={() => setSavingTemplate(false)}
          onSave={async (name) => {
            const err = await saveAsTemplate(name);
            if (!err) setSavingTemplate(false);
            return err;
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function ConfirmSend({
  purpose,
  audienceLabel,
  count,
  subject,
  onCancel,
  onConfirm,
}: {
  purpose: Purpose;
  audienceLabel: string;
  count: number;
  subject: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const people = `${nf.format(count)} ${count === 1 ? "person" : "people"}`;

  return (
    <Modal
      title="Send this email?"
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!checked || busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? "Working..." : `Send to ${people}`}
          </Btn>
        </>
      }
    >
      <dl className="text-sm space-y-2 mb-4">
        <div className="flex gap-3">
          <dt className="w-24 shrink-0" style={{ color: C.muted }}>Subject</dt>
          <dd className="font-semibold" style={{ color: C.ink }}>{subject}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0" style={{ color: C.muted }}>Kind</dt>
          <dd style={{ color: C.ink }}>{PURPOSE_LABEL[purpose]}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 shrink-0" style={{ color: C.muted }}>To</dt>
          <dd style={{ color: C.ink }}>
            {audienceLabel}, {people}
          </dd>
        </div>
      </dl>
      {!respectsOptOut(purpose) && (
        <div className="mb-3">
          <Note tone="warn">
            A service notice goes to people who unsubscribed too. Use it only for things
            they must know about their account.
          </Note>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm" style={{ color: C.ink }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1"
        />
        I have checked the preview. Once sent, an email cannot be taken back.
      </label>
    </Modal>
  );
}

function SaveTemplateModal({
  defaultName,
  onCancel,
  onSave,
}: {
  defaultName: string;
  onCancel: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title="Save as template"
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              setError(await onSave(name.trim()));
              setBusy(false);
            }}
          >
            {busy ? "Saving..." : "Save template"}
          </Btn>
        </>
      }
    >
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
      {error && (
        <p className="text-sm" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}

function SendProgress({
  progress,
  error,
  onAnother,
}: {
  progress: Progress;
  error: string | null;
  onAnother: () => void;
}) {
  const done = progress.sent + progress.failed + progress.skipped;
  const pct = progress.recipients ? Math.round((done / progress.recipients) * 100) : 100;
  const finished = progress.status !== "sending" || progress.pending === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{finished ? "Finished" : "Sending..."}</CardTitle>
      </CardHeader>
      <CardBody>
        <div
          className="h-2.5 rounded-full overflow-hidden mb-3"
          style={{ backgroundColor: C.divider }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: C.brand }} />
        </div>
        <p className="text-sm mb-4" style={{ color: C.ink }} data-testid="send-progress">
          {nf.format(progress.sent)} sent, {nf.format(progress.failed)} failed,{" "}
          {nf.format(progress.skipped)} skipped of {nf.format(progress.recipients)}
        </p>
        {!finished && !error && (
          <p className="text-xs mb-4" style={{ color: C.muted }}>
            Keep this page open until it finishes. If you leave, open the email in History
            and press Resume sending.
          </p>
        )}
        {error && (
          <div className="mb-4">
            <Note tone="danger">{error}</Note>
          </div>
        )}
        <div className="flex gap-2">
          <Link
            href="/admin/emails?tab=history"
            className="text-sm font-semibold px-4 py-2 rounded-lg border"
            style={{ borderColor: C.border, color: C.ink }}
          >
            View history
          </Link>
          {finished && <Btn onClick={onAnother}>Write another</Btn>}
        </div>
      </CardBody>
    </Card>
  );
}
