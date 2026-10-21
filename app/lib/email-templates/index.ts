// Registry mapping an email_templates.key to the function that renders it.
// The keys here must exist in the email_templates table, which is what supplies
// the admin-editable subject line and the live/paused switch.
import type { EmailRenderer } from "./shared";
import { teacherInviteTemplate } from "./teacherInvite";
import { passwordResetTemplate } from "./passwordReset";
import { accountSuspendedTemplate } from "./accountSuspended";
import { supportReplyTemplate } from "./supportReply";
import { enquiryReplyTemplate } from "./enquiryReply";
import { accountDeletionScheduledTemplate } from "./accountDeletionScheduled";
import { accountDeletionReminderTemplate } from "./accountDeletionReminder";
import { accountDeletedTemplate } from "./accountDeleted";
import { ambassadorApplicationReceivedTemplate } from "./ambassadorApplicationReceived";
import { ambassadorApprovedTemplate } from "./ambassadorApproved";
import { ambassadorDeclinedTemplate } from "./ambassadorDeclined";
import { ambassadorAgreementEndingTemplate } from "./ambassadorAgreementEnding";
import { ambassadorTaxSummaryTemplate } from "./ambassadorTaxSummary";
import { ambassadorQuietMonthTemplate } from "./ambassadorQuietMonth";
import { ambassadorUnderReviewTemplate } from "./ambassadorUnderReview";
import { ambassadorEndedInactivityTemplate } from "./ambassadorEndedInactivity";

export type EmailTemplateKey =
  | "teacher_invite"
  | "password_reset"
  | "account_suspended"
  | "support_reply"
  | "enquiry_reply"
  | "account_deletion_scheduled"
  | "account_deletion_reminder"
  | "account_deleted"
  | "ambassador_application_received"
  | "ambassador_approved"
  | "ambassador_declined"
  | "ambassador_agreement_ending"
  | "ambassador_tax_summary"
  | "ambassador_quiet_month"
  | "ambassador_under_review"
  | "ambassador_ended_inactivity";

export const TEMPLATES: Record<EmailTemplateKey, EmailRenderer> = {
  teacher_invite: teacherInviteTemplate,
  password_reset: passwordResetTemplate,
  account_suspended: accountSuspendedTemplate,
  support_reply: supportReplyTemplate,
  enquiry_reply: enquiryReplyTemplate,
  account_deletion_scheduled: accountDeletionScheduledTemplate,
  account_deletion_reminder: accountDeletionReminderTemplate,
  account_deleted: accountDeletedTemplate,
  ambassador_application_received: ambassadorApplicationReceivedTemplate,
  ambassador_approved: ambassadorApprovedTemplate,
  ambassador_declined: ambassadorDeclinedTemplate,
  ambassador_agreement_ending: ambassadorAgreementEndingTemplate,
  ambassador_tax_summary: ambassadorTaxSummaryTemplate,
  ambassador_quiet_month: ambassadorQuietMonthTemplate,
  ambassador_under_review: ambassadorUnderReviewTemplate,
  ambassador_ended_inactivity: ambassadorEndedInactivityTemplate,
};
