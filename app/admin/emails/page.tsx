import { requireSection } from "../access";
import { mailerConfigured } from "@/app/lib/email";
import { TEMPLATES } from "@/app/lib/email-templates";
import EmailsView, { type EmailTemplate } from "./EmailsView";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  const { supabase } = await requireSection("see_content");
  const { data } = await supabase.rpc("admin_email_templates");

  // Two separate facts, and this page used to assert the wrong value for the
  // first and say nothing about the second:
  //   1. is a provider configured at all (SendGrid keys present)
  //   2. does *this* row have a renderer in code — a row in email_templates
  //      with no entry in TEMPLATES can never send, whatever its live flag says
  return (
    <EmailsView
      rows={(data ?? []) as EmailTemplate[]}
      mailerReady={mailerConfigured()}
      renderableKeys={Object.keys(TEMPLATES)}
    />
  );
}
