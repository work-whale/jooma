// Server-side event log (Jooma 4.5 spec Step 7). Writes app_events under the
// service role: the table has no client grants at all. Never throws, because
// an analytics write must never fail the action it describes.
//
// Phase 1 events: signup_completed, trial_started, resource_made, activated,
// credits_ran_out, trial_ended, checkout_started, subscribed, moved_to_free,
// plan_changed, cancelled, payment_failed, prompt_shown, prompt_clicked,
// prompt_dismissed. (The spec's name "credits_ran_out" is kept as an event id
// because Ash's reports refer to it; teachers never see it.)
import "server-only";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

export type AppEventName =
  | "signup_completed"
  | "trial_started"
  | "resource_made"
  | "activated"
  | "credits_ran_out"
  | "trial_ended"
  | "checkout_started"
  | "subscribed"
  | "moved_to_free"
  | "plan_changed"
  | "cancelled"
  | "payment_failed"
  | "topup_bought"
  | "prompt_shown"
  | "prompt_clicked"
  | "prompt_dismissed"
  // Phase 2: the second run-out offer opened (P3b, E9b), with ends_at.
  | "offer_opened";

export async function recordAppEvent(
  userId: string | null,
  name: AppEventName,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("app_events").insert({ user_id: userId, name, props });
    // Before the plans engine migration is pushed the table does not exist;
    // that is expected and stays quiet.
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.warn("[app-events]", name, error.message);
    }
  } catch (err) {
    console.warn("[app-events]", name, err);
  }
}
