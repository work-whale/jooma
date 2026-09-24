// The engine behind bulk email: turning a campaign into recipients, sending
// them in batches, and the nightly sweep that sends the signup reminders.
//
// Everything here runs as the SERVICE ROLE, through functions the migration
// grants to service_role alone. That is deliberate: recipient addresses never
// travel to a browser, which is what lets the marketing role send without being
// able to read teacher data. The callers are the gate. Routes check
// requireAdminRoute('send_email_campaigns') first, the cron checks CRON_SECRET.
//
// WHO SENDS WHAT. A manual email is sent by the admin's browser, one batch per
// request, and resumed from History if the tab was closed. The nightly cron
// only sends the automatic signup reminders.
//
// NOTHING IS SENT TWICE. The unique (campaign, email) index means a person is
// only ever one row per campaign; a row is claimed with FOR UPDATE SKIP LOCKED
// before it is sent, so two browser tabs resuming the same campaign cannot
// overlap; and a row stuck mid-send is marked failed, never retried (see
// email_campaign_claim).
import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { mailerConfigured, sendBroadcastEmail } from "./email";
import {
  contentFromRow,
  oneClickUnsubscribeUrl,
  renderBroadcast,
  respectsOptOut,
  unsubscribePageUrl,
} from "./email-templates/broadcast";

export interface CampaignProgress {
  status: string;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  /** How many rows this call claimed. Zero with pending above zero means
   *  another worker holds them, so the caller should stop looping. */
  batch: number;
}

/** Per call from the browser. Small enough that one request finishes in a few
 *  seconds, so the progress bar moves and nothing nears a timeout. */
export const BATCH_SIZE = 50;

/** Parallel SendGrid requests within a batch. SendGrid's documented limit is
 *  far higher; this is about not holding 50 sockets open from one function. */
const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Turn a due campaign's audience into recipient rows. Idempotent. */
export async function materialiseCampaign(id: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("email_campaign_materialise", { p_id: id });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

interface ClaimedRow {
  id: number;
  email: string;
  first_name: string | null;
  unsub_token: string;
}

/**
 * Send one batch of a campaign and report where it stands.
 *
 * Each recipient gets their own render: their name in the greeting and their
 * own unsubscribe token in the footer and the List-Unsubscribe header.
 */
export async function sendBatch(id: string, limit = BATCH_SIZE): Promise<CampaignProgress> {
  const { data: campaign, error } = await supabaseAdmin
    .from("email_campaigns")
    .select("id, purpose, subject, preheader, heading, body, cta_label, cta_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("That email no longer exists.");

  const { data: rows, error: claimError } = await supabaseAdmin.rpc("email_campaign_claim", {
    p_id: id,
    p_limit: limit,
  });
  if (claimError) throw new Error(claimError.message);
  const claimed = (rows ?? []) as ClaimedRow[];

  const content = contentFromRow(campaign);
  const purpose = campaign.purpose as string;
  const withLink = respectsOptOut(purpose);

  const results = await mapLimit(claimed, CONCURRENCY, async (r) => {
    try {
      const rendered = renderBroadcast(
        content,
        { email: r.email, firstName: r.first_name },
        { purpose, unsubscribeUrl: withLink ? unsubscribePageUrl(r.unsub_token) : null },
      );
      const outcome = await sendBroadcastEmail(r.email, rendered, {
        purpose,
        oneClickUrl: withLink ? oneClickUnsubscribeUrl(r.unsub_token) : null,
      });
      return { id: r.id, status: outcome.status, error: outcome.error ?? null };
    } catch (e) {
      return { id: r.id, status: "failed", error: e instanceof Error ? e.message : "Render failed" };
    }
  });

  // Called even for an empty batch: it is also what closes a campaign whose
  // last rows another worker finished.
  const { data: progress, error: recordError } = await supabaseAdmin.rpc("email_campaign_record", {
    p_id: id,
    p_results: results,
  });
  if (recordError) throw new Error(recordError.message);

  return { ...(progress as Omit<CampaignProgress, "batch">), batch: claimed.length };
}

export interface SweepSummary {
  automations: number;
  batches: number;
  skippedReason?: string;
}

/**
 * The nightly cron's whole job, bounded by a time budget: run each live
 * automatic signup reminder, then send what it queued.
 *
 * Only AUTOMATIC campaigns are drained here. A manual send an admin walked
 * away from stays paused until someone presses Resume in History: mail an admin
 * chose to send at 2pm should not surprise everyone by landing at midnight.
 */
export async function runDue(budgetMs: number): Promise<SweepSummary> {
  const deadline = Date.now() + budgetMs;
  const summary: SweepSummary = { automations: 0, batches: 0 };

  // Without a provider every recipient would be burned as failed. Leave the
  // work queued; it goes out on the first run after the keys are set.
  if (!mailerConfigured()) {
    return { ...summary, skippedReason: "SendGrid is not configured" };
  }

  const { data: automations, error: autoError } = await supabaseAdmin
    .from("email_automations")
    .select("key")
    .eq("live", true);
  if (autoError) console.error("[email-campaigns] could not read automations", autoError);
  for (const a of automations ?? []) {
    const { data: created, error } = await supabaseAdmin.rpc("email_automation_enqueue", {
      p_key: a.key,
    });
    if (error) console.error("[email-campaigns] automation failed", a.key, error);
    else if (created) summary.automations++;
  }

  const { data: sending, error: sendingError } = await supabaseAdmin
    .from("email_campaigns")
    .select("id")
    .eq("status", "sending")
    .not("automation", "is", null)
    .order("started_at")
    .limit(20);
  if (sendingError) console.error("[email-campaigns] could not read sending campaigns", sendingError);
  for (const s of sending ?? []) {
    while (Date.now() < deadline) {
      let p: CampaignProgress;
      try {
        p = await sendBatch(s.id);
      } catch (e) {
        console.error("[email-campaigns] batch failed", s.id, e);
        break;
      }
      summary.batches++;
      if (p.status !== "sending" || p.pending === 0 || p.batch === 0) break;
    }
    if (Date.now() >= deadline) break;
  }

  return summary;
}
