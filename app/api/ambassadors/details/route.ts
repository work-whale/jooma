import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import {
  normaliseAccountNumber,
  normaliseHandle,
  normaliseSortCode,
  validateChannels,
  validatePayoutDetails,
  validateTax,
  type ChannelsInput,
  type PayoutInput,
  type PersonalInput,
} from "@/app/lib/ambassador-application";

// An ambassador editing their own details from the Payout details tab.
//
// One section at a time, validated with the application form's own rules, then
// written by update_my_ambassador_details(), which only ever touches the
// caller's own application. Changing where they are paid stamps
// payout_changed_at, which the admin sees as "verify before paying".

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const section = body?.section;
  const v = (body?.values ?? {}) as Record<string, string>;
  let payload: Record<string, string | null>;
  let errors: Record<string, string> = {};

  if (section === "personal") {
    const p = v as unknown as PersonalInput;
    if (!EMAIL.test(String(p.email ?? "").trim())) errors.email = "Enter a valid email address.";
    if (!/^\+?\d{7,15}$/.test(String(p.mobile ?? "").replace(/[\s()-]/g, ""))) errors.mobile = "Enter a mobile number.";
    if (!String(p.address_line ?? "").trim()) errors.address_line = "Enter your address.";
    if (!String(p.town ?? "").trim()) errors.town = "Enter your town or city.";
    if (String(p.postcode ?? "").trim().length < 2) errors.postcode = "Enter your postcode.";
    payload = {
      email: String(p.email ?? "").trim(),
      mobile: String(p.mobile ?? "").trim(),
      address_line: String(p.address_line ?? "").trim(),
      town: String(p.town ?? "").trim(),
      postcode: String(p.postcode ?? "").trim(),
      school: String(p.school ?? "").trim() || null,
      teaches: String(p.teaches ?? "").trim() || null,
    };
  } else if (section === "channels") {
    const c = v as unknown as ChannelsInput;
    errors = validateChannels(c);
    payload = {
      instagram: normaliseHandle(c.instagram) || null,
      tiktok: normaliseHandle(c.tiktok) || null,
      x_handle: normaliseHandle(c.x_handle) || null,
      facebook: normaliseHandle(c.facebook) || null,
      youtube: normaliseHandle(c.youtube) || null,
      linkedin: normaliseHandle(c.linkedin) || null,
      reach: c.reach,
      note: String(c.note ?? "").trim() || null,
    };
  } else if (section === "payout") {
    const p = v as unknown as PayoutInput;
    errors = validatePayoutDetails(p);
    const bank = p.payout_method === "bank";
    payload = {
      payout_method: p.payout_method,
      account_holder: String(p.account_holder ?? "").trim(),
      sort_code: bank ? normaliseSortCode(p.sort_code) : null,
      account_number: bank ? normaliseAccountNumber(p.account_number) : null,
      bank_name: bank ? String(p.bank_name ?? "").trim() : null,
      paypal_email: bank ? null : String(p.paypal_email ?? "").trim().toLowerCase(),
    };
  } else if (section === "tax") {
    errors = validateTax({ tax_status: v.tax_status, utr: v.utr ?? "" });
    payload = { tax_status: v.tax_status, utr: String(v.utr ?? "").replace(/\s/g, "") || null };
  } else {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Some details need another look.", errors }, { status: 400 });
  }

  const { error } = await supabase.rpc("update_my_ambassador_details", {
    p_section: section,
    payload,
  });
  if (error) {
    console.error("[ambassadors/details] update failed", error);
    return NextResponse.json({ error: "Could not save your details." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
