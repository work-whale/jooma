import "server-only";
import { cache } from "react";
import { createClient } from "@/app/lib/auth/server";
import type { LedgerRow } from "@/app/lib/ambassador-commission";
import { reviewTrialEnd } from "@/app/lib/plans";
import {
  agreementInForce,
  offerNewAgreement,
  type Acceptance,
  type AgreementInForce,
} from "@/app/lib/ambassador-agreement-status";

// Everything the ambassador's pages read, through definer functions scoped to
// the caller (supabase/migrations/20261014000000_ambassador_programme_v2.sql).
// Wrapped in React cache() so the layout and the tab under it share one fetch
// per request.

export interface MyAmbassador {
  full_name: string;
  status: string;
  pro_until: string | null;
  codes: string[];
  referrals: number;
  subscribers: number;
  active_subscribers: number;
  this_month_pence: number;
  all_time_pence: number;
  owed_pence: number;
  paid_pence: number;
  approved_at: string | null;
  agreement_ends_at: string | null;
  end_requested_at: string | null;
  created_at: string;
  /** Under review for inactivity (agreement clause 5). Null when not. */
  review_started_at: string | null;
  review_deadline: string | null;
  /** Ended for inactivity (clause 6): status 'ended'. */
  ended_at: string | null;
  end_reason: string | null;
}

export interface MyApplication {
  id: string;
  status: "pending" | "approved" | "declined";
  first_name: string;
  requested_code: string;
  submitted_at: string;
  reviewed_at: string | null;
  decline_reason: string | null;
}

export interface MyReferral {
  redeemed_at: string;
  first_paid_at: string | null;
  plan: string | null;
  billing_interval: "month" | "year" | null;
  state: "paying" | "trial" | "lapsed" | "signed_up";
}

export interface MyDetails {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  address_line: string;
  town: string;
  postcode: string;
  school: string | null;
  teaches: string | null;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
  facebook: string | null;
  youtube: string | null;
  linkedin: string | null;
  reach: string;
  note: string | null;
  payout_method: "bank" | "paypal";
  account_holder: string;
  sort_code: string | null;
  account_last4: string | null;
  bank_name: string | null;
  paypal_email: string | null;
  payout_changed_at: string | null;
  tax_status: string;
  has_utr: boolean;
  agreement_version: string;
  signature_name: string;
  signed_at: string;
  /** Channel keys an admin has checked by hand. */
  verified_channels: string[];
}

export const loadAmbassadorContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, ambassador: null, application: null, firstName: null, reviewTrialUntil: null };
  }

  const [{ data: me }, { data: app }, { data: profile }] = await Promise.all([
    supabase.rpc("my_ambassador"),
    supabase.rpc("my_ambassador_application"),
    supabase
      .from("profiles")
      .select("first_name, plan, subscription_status, stripe_subscription_id, current_period_end")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const ambassador = (Array.isArray(me) ? me[0] : null) as MyAmbassador | null;
  const application = (Array.isArray(app) ? app[0] : null) as MyApplication | null;
  const firstName =
    profile?.first_name?.trim() ||
    application?.first_name ||
    ambassador?.full_name.split(" ")[0] ||
    null;

  // Standard free while the application is read (grantApplicantTrial).
  const trialEnd = reviewTrialEnd(profile);
  const reviewTrialUntil =
    trialEnd && trialEnd.getTime() > Date.now()
      ? trialEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })
      : null;

  return {
    user,
    ambassador,
    application,
    firstName,
    plan: (profile?.plan as string | null) ?? null,
    reviewTrialUntil,
  };
});

export const loadReferrals = cache(async (): Promise<MyReferral[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_ambassador_referrals");
  return (data ?? []) as MyReferral[];
});

export const loadLedger = cache(async (): Promise<LedgerRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_ambassador_commissions");
  return (data ?? []) as LedgerRow[];
});

export const loadDetails = cache(async (): Promise<MyDetails | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_ambassador_details");
  return ((Array.isArray(data) ? data[0] : null) ?? null) as MyDetails | null;
});

export interface MyAgreementState {
  /** The version on the application, signed when they applied. */
  signedVersion: string | null;
  inForce: AgreementInForce | null;
  /** Offer the current version in place of an older one (offerNewAgreement). */
  offer: boolean;
}

/** Which agreement they are on, and whether to offer them the current one. */
export const loadAgreementState = cache(async (): Promise<MyAgreementState> => {
  const ctx = await loadAmbassadorContext();
  if (!ctx.user) return { signedVersion: null, inForce: null, offer: false };
  const supabase = await createClient();
  const [details, { data: rows }] = await Promise.all([
    loadDetails(),
    supabase.rpc("my_ambassador_agreement_acceptances"),
  ]);
  const signedVersion = details?.agreement_version ?? null;
  const inForce = signedVersion ? agreementInForce(signedVersion, (rows ?? []) as Acceptance[]) : null;
  const offer = offerNewAgreement({
    ambassador: ctx.ambassador,
    applicationStatus: ctx.application?.status ?? null,
    inForceVersion: inForce?.version ?? null,
    now: new Date(),
  });
  return { signedVersion, inForce, offer };
});

/** An agreement still running: approved, not paused, end date not passed. */
export function agreementLive(a: MyAmbassador): boolean {
  if (a.status !== "active") return false;
  return !a.agreement_ends_at || new Date(a.agreement_ends_at).getTime() > Date.now();
}
