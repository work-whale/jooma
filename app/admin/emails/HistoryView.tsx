"use client";

// Every bulk email: sent, sending, scheduled, cancelled. Each row keeps a
// snapshot of what went out, so editing a template later does not rewrite
// history.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { PURPOSE_LABEL, contentFromRow, type Purpose } from "@/app/lib/email-templates/broadcast";
import { fmtDateTime, nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardFooter,
  EmptyState,
  Modal,
  Note,
  Table,
  Tag,
  Td,
  Th,
  Tr,
  useToast,
  type Tone,
} from "../ui";
import BroadcastPreview from "./BroadcastPreview";
import { drainCampaign, type Progress } from "./drain";
import type { CampaignRow } from "./types";

const STATUS: Record<CampaignRow["status"], { tone: Tone; label: string }> = {
  scheduled: { tone: "brand", label: "Scheduled" },
  sending: { tone: "warn", label: "Sending" },
  sent: { tone: "ok", label: "Sent" },
  cancelled: { tone: "plain", label: "Cancelled" },
  failed: { tone: "danger", label: "Failed" },
};

function when(c: CampaignRow): string {
  if (c.status === "scheduled") return fmtDateTime(c.scheduled_for);
  return fmtDateTime(c.finished_at ?? c.started_at ?? c.created_at);
}

export default function HistoryView({ rows }: { rows: CampaignRow[] }) {
  const [open, setOpen] = useState<CampaignRow | null>(null);
  const [toastNode, fire] = useToast();
  const router = useRouter();

  return (
    <>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing sent yet" body="Emails you send or schedule appear here." />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Subject</Th>
                <Th>Kind</Th>
                <Th>To</Th>
                <Th>Status</Th>
                <Th align="right">Sent</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Skipped</Th>
                <Th>When</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id} clickable onClick={() => setOpen(c)}>
                  <Td>
                    <span className="font-semibold" style={{ color: C.ink }}>
                      {c.subject}
                    </span>
                  </Td>
                  <Td>
                    <Tag>{PURPOSE_LABEL[c.purpose as Purpose] ?? c.purpose}</Tag>
                  </Td>
                  <Td>
                    <span className="text-xs" style={{ color: C.ink2 }}>
                      {c.audience_label}
                      {c.recipient_count > 0 && ` (${nf.format(c.recipient_count)})`}
                    </span>
                  </Td>
                  <Td>
                    <Tag tone={STATUS[c.status].tone} dot>
                      {STATUS[c.status].label}
                    </Tag>
                  </Td>
                  <Td align="right" mono>
                    {nf.format(c.sent_count)}
                  </Td>
                  <Td align="right" mono>
                    {nf.format(c.failed_count)}
                  </Td>
                  <Td align="right" mono>
                    {nf.format(c.skipped_count)}
                  </Td>
                  <Td>
                    <span className="text-xs whitespace-nowrap" style={{ color: C.ink2 }}>
                      {when(c)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs" style={{ color: C.muted }}>
                      {c.automation ? "Automatic" : (c.created_by_email ?? "Unknown")}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardFooter>
          {nf.format(rows.length)} emails · counts refresh when you reopen this tab
        </CardFooter>
      </Card>

      {open && (
        <CampaignDetail
          campaign={open}
          onClose={() => {
            setOpen(null);
            router.refresh();
          }}
          onCancelled={() => {
            setOpen(null);
            fire("Cancelled.");
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function CampaignDetail({
  campaign,
  onClose,
  onCancelled,
}: {
  campaign: CampaignRow;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const status = progress?.status ?? campaign.status;
  const cancellable = status === "scheduled" || status === "sending";
  // A manual send whose tab was closed part way. Automatic reminders are
  // finished by the nightly run instead, so they get no button.
  const resumable = status === "sending" && !campaign.automation;

  const resume = async () => {
    setBusy(true);
    setError(null);
    const result = await drainCampaign(campaign.id, setProgress);
    setBusy(false);
    if (result.error) setError(result.error);
  };

  const cancel = async () => {
    setBusy(true);
    const { error: e } = await createClient().rpc("admin_cancel_email_campaign", {
      p_id: campaign.id,
    });
    setBusy(false);
    if (e) setError(e.message);
    else onCancelled();
  };

  return (
    <Modal
      title={campaign.subject}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          {cancellable && (
            <Btn variant="danger" onClick={cancel} disabled={busy}>
              {status === "scheduled" ? "Cancel this email" : "Stop sending"}
            </Btn>
          )}
          {resumable && (
            <Btn variant="primary" onClick={resume} disabled={busy}>
              {busy ? "Sending..." : "Resume sending"}
            </Btn>
          )}
          <Btn onClick={onClose}>Close</Btn>
        </>
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <Tag tone={STATUS[status as CampaignRow["status"]]?.tone ?? "plain"} dot>
          {STATUS[status as CampaignRow["status"]]?.label ?? status}
        </Tag>
        <Tag>{PURPOSE_LABEL[campaign.purpose as Purpose] ?? campaign.purpose}</Tag>
        <Tag>{campaign.audience_label}</Tag>
      </div>
      <p className="text-sm mb-4" style={{ color: C.ink2 }} data-testid="campaign-counts">
        {status === "scheduled"
          ? `Goes out ${fmtDateTime(campaign.scheduled_for)}.`
          : progress
            ? `${nf.format(progress.sent)} sent, ${nf.format(progress.failed)} failed, ${nf.format(
                progress.skipped,
              )} skipped of ${nf.format(progress.recipients)}.`
            : `${nf.format(campaign.sent_count)} sent, ${nf.format(campaign.failed_count)} failed, ${nf.format(
                campaign.skipped_count,
              )} skipped of ${nf.format(campaign.recipient_count)}.`}
      </p>
      {resumable && !busy && (
        <div className="mb-3">
          <Note>
            This email stopped part way, usually because the page was closed while it
            was sending. Nobody who already received it will get it twice.
          </Note>
        </div>
      )}
      {campaign.failed_count > 0 && (
        <div className="mb-3">
          <Note tone="warn">
            Failed emails are not retried automatically, so nobody gets the same email
            twice. Send again to a chosen list if they matter.
          </Note>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Note tone="danger">{error}</Note>
        </div>
      )}
      <BroadcastPreview content={contentFromRow(campaign)} purpose={campaign.purpose} height={460} />
    </Modal>
  );
}
