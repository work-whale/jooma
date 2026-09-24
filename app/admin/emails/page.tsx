import { requireAnySection } from "../access";
import { mailerConfigured } from "@/app/lib/email";
import { TEMPLATES } from "@/app/lib/email-templates";
import { Note, PageHead } from "../ui";
import ComposeView from "./ComposeView";
import EmailTabs from "./EmailTabs";
import HistoryView from "./HistoryView";
import SystemEmails, { type EmailTemplate } from "./SystemEmails";
import TemplatesView from "./TemplatesView";
import type { AutomationRow, BroadcastTemplate, CampaignRow } from "./types";

export const dynamic = "force-dynamic";

// Emails & templates. Two jobs on one page, for two kinds of admin:
//
//   * send_email_campaigns (super admin, marketing): write and send bulk email,
//     see what went out, keep templates, run the automatic signup reminders.
//   * see_content (super admin, support): the wording of the automatic system
//     emails, which is all this page used to be.
//
// Each sees only their part. The RPCs behind each part re-check the same
// permission, so hiding a tab here is presentation, not the boundary.

const SEND_TABS = [
  { key: "compose", label: "Compose" },
  { key: "history", label: "History" },
  { key: "templates", label: "Templates" },
];

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; template?: string }>;
}) {
  const { supabase, access } = await requireAnySection(["see_content", "send_email_campaigns"]);
  const canSend = access.can("send_email_campaigns");
  const canSystem = access.can("see_content");

  const { tab: asked, template } = await searchParams;
  const tabs = canSend ? SEND_TABS : [{ key: "templates", label: "Templates" }];
  const tab = tabs.find((t) => t.key === asked)?.key ?? tabs[0].key;
  const mailerReady = mailerConfigured();

  let body: React.ReactNode;
  const problems: string[] = [];

  if (tab === "compose") {
    const { data, error } = await supabase.rpc("admin_broadcast_templates");
    if (error) problems.push(error.message);
    body = (
      <ComposeView
        // A different ?template= starts a fresh draft rather than keeping the
        // one on screen, which is the Suspense-key trick applied to state.
        key={template ?? "blank"}
        templates={(data ?? []) as BroadcastTemplate[]}
        initialTemplateId={template ?? null}
        mailerReady={mailerReady}
      />
    );
  } else if (tab === "history") {
    const { data, error } = await supabase.rpc("admin_email_campaigns", { lim: 200 });
    if (error) problems.push(error.message);
    body = <HistoryView rows={(data ?? []) as CampaignRow[]} />;
  } else {
    const [templates, automations, system] = await Promise.all([
      canSend ? supabase.rpc("admin_broadcast_templates") : null,
      canSend ? supabase.rpc("admin_email_automations") : null,
      canSystem ? supabase.rpc("admin_email_templates") : null,
    ]);
    for (const r of [templates, automations, system]) {
      if (r?.error) problems.push(r.error.message);
    }
    body = (
      <div className="space-y-8">
        {canSend && (
          <TemplatesView
            templates={(templates?.data ?? []) as BroadcastTemplate[]}
            automations={(automations?.data ?? []) as AutomationRow[]}
          />
        )}
        {canSystem && (
          <section>
            <SystemEmails
              rows={(system?.data ?? []) as EmailTemplate[]}
              mailerReady={mailerReady}
              renderableKeys={Object.keys(TEMPLATES)}
            />
          </section>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHead
        title="Emails & templates"
        sub={
          canSend
            ? "Email teachers and people who never finished signing up, and manage every template Jooma sends."
            : "Every automatic email Jooma sends."
        }
      />
      {tabs.length > 1 && <EmailTabs tabs={tabs} current={tab} />}
      {problems.length > 0 && (
        <div className="mb-4">
          <Note tone="danger">
            <b>Some of this page could not load.</b> {problems[0]}
          </Note>
        </div>
      )}
      {body}
    </>
  );
}
