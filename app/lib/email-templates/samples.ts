// Stand-in values for the /admin/emails preview.
//
// Every name here matches what the real call site passes — see the trigger
// routes listed against each entry — so a preview exercises the same branches
// the live email will. Where a template changes shape depending on a parameter
// (teacher_invite reads differently with and without an inviter name), the
// sample fills it in, because the populated branch is the one that actually
// goes out.
//
// The values are deliberately obvious fakes. An admin looking at a preview
// should never be left wondering whether they are looking at a real teacher's
// details or an email that has already been sent.
import type { EmailTemplateKey } from "./index";

export const SAMPLE_PARAMS: Record<EmailTemplateKey, Record<string, string>> = {
  // app/api/admin/teachers/invite/route.ts
  teacher_invite: {
    inviteUrl: "https://www.jooma.ai/signup?invite=sample-token",
    inviterName: "Sam Okafor",
  },

  // app/api/admin/teachers/reset-password/route.ts, and
  // app/api/auth/password-link/route.ts for the two self-serve triggers
  // (/forgot-password, and adding a password to a Google account). All three
  // pass the same two parameters, so one sample covers them.
  password_reset: {
    resetUrl: "https://www.jooma.ai/create-password?token_hash=sample&type=recovery",
    firstName: "Priya",
  },

  // app/api/admin/teachers/suspend/route.ts — reason is optional in the real
  // send; populated here so the reason block renders and can be reviewed.
  account_suspended: {
    reason: "Repeated sharing of a single login across a department.",
  },

  // app/api/support/reply/route.ts
  support_reply: {
    subject: "Slideshow export is coming out blank",
    body: "Thanks for flagging this — we've pushed a fix. Please try the export again and let us know if it's still blank.",
    reference: "TK-1042",
    threadId: "00000000-0000-0000-0000-000000000000",
  },

  // app/api/enquiries/reply/route.ts — replyTo is filled in because the whole
  // point of this email is that it comes back to a real mailbox, and a preview
  // with the line missing would not show that.
  enquiry_reply: {
    name: "Priya Shah",
    body: "Thanks for getting in touch. For 25 teachers we'd look at a school licence, which pools credits across your staff and bills on one invoice. Happy to walk you through it on a call this week.",
    reference: "EN-1042",
    replyTo: "info@jooma.ai",
  },

  // app/api/account/deletion/route.ts. The date is pre-formatted by the caller
  // rather than passed as an ISO string, so the sample is too: a preview that
  // rendered "2026-10-13T00:00:00.000Z" would not show what lands in a mailbox.
  account_deletion_scheduled: {
    scheduledDate: "13 October 2026",
  },

  // app/api/cron/process-deletions/route.ts, three days before the deadline.
  account_deletion_reminder: {
    scheduledDate: "13 October 2026",
  },

  // app/api/cron/process-deletions/route.ts, once the deletion has run. Takes
  // no parameters: by this point there is no account left to say anything about.
  account_deleted: {},

  // app/api/ambassadors/apply/route.ts, once the application is stored.
  ambassador_application_received: {
    firstName: "Priya",
    code: "PRIYA-4K2",
    paidBy: "PayPal (priya@example.co.uk)",
    signedDate: "13 October 2026",
    trialEnds: "16 October",
  },

  // app/api/admin/ambassadors/applications/[id]/route.ts, once approved.
  ambassador_approved: {
    firstName: "Priya",
    code: "PRIYA-4K2",
    offer: "20% off their first month",
    agreementEnds: "13 October 2027",
    proLine: "Your Pro account is free until then too.",
  },

  // app/api/admin/ambassadors/applications/[id]/route.ts, on decline. `reason`
  // is what the admin typed in the review drawer, and may be empty.
  ambassador_declined: {
    firstName: "Priya",
    reason: "We are keeping the programme to teachers who post weekly for now. Do apply again next term.",
  },

  // app/api/cron/ambassador-terms/route.ts, a month before the agreement ends.
  ambassador_agreement_ending: {
    firstName: "Priya",
    endDate: "13 October 2027",
    code: "PRIYA-4K2",
  },

  // app/api/cron/ambassador-terms/route.ts, each April for the year just ended.
  ambassador_tax_summary: {
    firstName: "Priya",
    taxYear: "2026 to 2027",
    totalPaid: "£1,284.50",
    payments: "11",
    period: "6 April 2026 to 5 April 2027",
  },

  // app/api/cron/ambassador-terms/route.ts, after one quiet month.
  ambassador_quiet_month: {
    firstName: "Priya",
    code: "PRIYA-4K2",
  },

  // app/api/cron/ambassador-terms/route.ts, the day a review starts.
  ambassador_under_review: {
    firstName: "Priya",
    deadline: "15 January 2027",
    code: "PRIYA-4K2",
  },

  // app/api/admin/ambassadors/route.ts, when an admin ends it for inactivity.
  ambassador_ended_inactivity: {
    firstName: "Priya",
    reason: "No new subscriber joined on your code in the two months before the review, or in the 14 days of it.",
    proEnds: "31 January 2027",
    agreementEnds: "13 October 2027",
  },
};
