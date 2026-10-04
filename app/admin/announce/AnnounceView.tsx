"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { fmtDate, nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Modal,
  Note,
  PageHead,
  Tag,
  Toggle,
  ToggleRow,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";

export interface AnnouncementRow {
  id: string;
  message: string;
  type: string;
  audience: string;
  school_name: string | null;
  dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
  live: boolean;
  seen_count: number;
  dismissed_count: number;
  click_count: number;
  is_current: boolean;
  created_at: string;
}

const AUDIENCE_LABEL: Record<string, string> = {
  everyone: "Everyone",
  free: "No plan only",
  paying: "Paying teachers",
  school: "School plans only",
  one_school: "One school",
};

const TYPE_TONE: Record<string, "brand" | "warn" | "danger"> = {
  info: "brand",
  warning: "warn",
  maintenance: "danger",
};

export default function AnnounceView({ rows }: { rows: AnnouncementRow[] }) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [toastNode, fire] = useToast();

  const current = rows.filter((r) => r.is_current);
  const scheduled = rows.filter((r) => !r.is_current && r.live);
  const drafts = rows.filter((r) => !r.live);

  const setLive = async (id: string, live: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_upsert_announcement", {
      payload: { id, live },
    });
    if (error) {
      fire(error.message);
      return;
    }
    fire(live ? "Announcement is live." : "Taken down.");
    router.refresh();
  };

  const card = (r: AnnouncementRow) => (
    <div
      key={r.id}
      className="rounded-xl border p-3.5"
      style={{ borderColor: C.border, backgroundColor: C.white }}
    >
      <div className="flex items-start gap-2 mb-2">
        <Tag tone={TYPE_TONE[r.type] ?? "brand"}>{r.type}</Tag>
        <Tag>{r.school_name ?? AUDIENCE_LABEL[r.audience] ?? r.audience}</Tag>
        {!r.dismissible && <Tag tone="warn">Can&apos;t dismiss</Tag>}
      </div>
      <p className="text-sm mb-2" style={{ color: C.ink }}>
        {r.message}
      </p>
      {/* click_count is deliberately not shown. An announcement is a plain
          sentence with no link in it, so there is nothing for a teacher to
          click and the number would sit at zero forever. Add a link_url column
          and a CTA in the banner if that ever needs to mean something. */}
      <div className="text-xs mb-2" style={{ color: C.muted }}>
        {fmtDate(r.starts_at)}
        {r.ends_at ? ` — ${fmtDate(r.ends_at)}` : " — no end date"}
        {" · "}
        seen by {nf.format(Number(r.seen_count))} · dismissed by{" "}
        {nf.format(Number(r.dismissed_count))}
      </div>
      <div className="flex gap-2">
        <Btn size="sm" onClick={() => setEditing(r)}>
          Edit
        </Btn>
        <Btn
          size="sm"
          variant={r.live ? "danger" : "primary"}
          onClick={() => setLive(r.id, !r.live)}
        >
          {r.live ? "Take down" : "Publish"}
        </Btn>
      </div>
    </div>
  );

  return (
    <>
      <PageHead
        title="Announcements"
        sub="Banners inside the teacher dashboard. Use sparingly — for maintenance, new tools, and term-start messages."
      >
        <Btn variant="primary" onClick={() => setComposing(true)}>
          + New announcement
        </Btn>
      </PageHead>

      <div className="mb-4">
        <Note>
          Banners appear at the top of the teacher&apos;s dashboard, tools, folders and
          analytics pages, and everything live is listed at{" "}
          <b>/announcements</b>. Seen and dismissed are counts of distinct teachers,
          not page views.
        </Note>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No announcements"
            body="Write one when you have maintenance planned or a new tool to tell teachers about."
            action={
              <Btn variant="primary" onClick={() => setComposing(true)}>
                New announcement
              </Btn>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Live now</CardTitle>
              <Tag tone={current.length > 0 ? "ok" : "plain"}>{current.length}</Tag>
            </CardHeader>
            <CardBody>
              {current.length === 0 ? (
                <p className="text-sm" style={{ color: C.muted }}>
                  Nothing showing to teachers right now.
                </p>
              ) : (
                <div className="space-y-2.5">{current.map(card)}</div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scheduled &amp; drafts</CardTitle>
              <Tag>{scheduled.length + drafts.length}</Tag>
            </CardHeader>
            <CardBody>
              {scheduled.length + drafts.length === 0 ? (
                <p className="text-sm" style={{ color: C.muted }}>
                  Nothing queued.
                </p>
              ) : (
                <div className="space-y-2.5">{[...scheduled, ...drafts].map(card)}</div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {(composing || editing) && (
        <ComposeModal
          existing={editing}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
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

/** A timestamptz from the API rendered for <input type="date">. */
function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ComposeModal({
  existing,
  onClose,
  onSaved,
}: {
  /** Null when composing; a row when editing one that already exists. */
  existing: AnnouncementRow | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [message, setMessage] = useState(existing?.message ?? "");
  const [type, setType] = useState(existing?.type ?? "info");
  const [audience, setAudience] = useState(existing?.audience ?? "everyone");
  const [startsAt, setStartsAt] = useState(dateInputValue(existing?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(dateInputValue(existing?.ends_at ?? null));
  const [dismissible, setDismissible] = useState(existing?.dismissible ?? true);
  const [live, setLive] = useState(existing?.live ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("admin_upsert_announcement", {
      payload: {
        ...(existing ? { id: existing.id } : {}),
        message,
        type,
        audience,
        // Both dates are sent even when blank: the RPC reads `payload ? 'key'`,
        // so an empty string clears the value rather than leaving the old one.
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        dismissible,
        live,
      },
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    onSaved(
      existing
        ? "Announcement updated."
        : live
          ? "Announcement published."
          : "Saved as a draft.",
    );
    onClose();
  };

  return (
    <Modal
      title={existing ? "Edit announcement" : "New announcement"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving || !message.trim()}>
            {saving
              ? "Saving…"
              : existing
                ? "Save changes"
                : live
                  ? "Publish"
                  : "Save draft"}
          </Btn>
        </>
      }
    >
      <Field label="Message" help="Keep it to one sentence.">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Planned maintenance Sunday 07:00–08:00."
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            <option value="info">Information</option>
            <option value="warning">Warning</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Show to">
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            {Object.entries(AUDIENCE_LABEL)
              .filter(([k]) => k !== "one_school")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Starts" help="Leave blank to start as soon as it's published.">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
        <Field label="Until" help="Leave blank to show it until you take it down.">
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
      </div>

      <ToggleRow
        title="Teachers can dismiss it"
        desc="Turn off for anything they must read."
      >
        <Toggle on={dismissible} onChange={setDismissible} label="Dismissible" />
      </ToggleRow>
      <ToggleRow
        title={existing ? "Live" : "Publish immediately"}
        desc={
          existing
            ? "Turn off to take it down without deleting it."
            : "Off saves it as a draft."
        }
      >
        <Toggle on={live} onChange={setLive} label="Publish" />
      </ToggleRow>

      {error && (
        <p className="text-sm mt-2" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
