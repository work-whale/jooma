// Row shapes the Emails & templates page reads, as its RPCs return them.

/** email_broadcast_templates, via admin_broadcast_templates(). */
export interface BroadcastTemplate {
  id: string;
  name: string;
  purpose: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta_label: string;
  cta_url: string;
  updated_at: string;
}

/** admin_email_campaigns(). */
export interface CampaignRow {
  id: string;
  purpose: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  cta_label: string;
  cta_url: string;
  audience_label: string;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  scheduled_for: string;
  automation: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_by_email: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** email_automations, via admin_email_automations(). */
export interface AutomationRow {
  key: string;
  name: string;
  description: string;
  template_id: string | null;
  live: boolean;
  delay_hours: number;
  updated_at: string;
}
