// Runtime reader for the image_generation row in app_settings.
//
// Same shape as tool-model.ts: read on every AI image, changed only when an
// admin is calibrating, so a 60s per-instance cache keeps it off the hot path.
// Fails open to DEFAULT_IMAGE_SETTINGS: a bug here can fail to apply an admin's
// choice, never stop an image being made.
import "server-only";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_SETTINGS_KEY,
  normalizeImageSettings,
  type ImageSettings,
} from "@/app/lib/image-quality";

const TTL_MS = 60_000;

let cache: { value: ImageSettings; at: number } | null = null;

/** The configured image settings. Never throws. */
export async function imageSettings(): Promise<ImageSettings> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  try {
    // Service role: app_settings is admin-only under RLS, and this runs inside
    // routes for every teacher. It holds no user data.
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", IMAGE_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;

    const value = normalizeImageSettings(data?.value);
    cache = { value, at: now };
    return value;
  } catch (err) {
    // Deliberately does not advance `at`, so the next request retries.
    console.warn(
      "[image-settings] could not read app_settings:",
      err instanceof Error ? err.message : err,
    );
    return cache?.value ?? DEFAULT_IMAGE_SETTINGS;
  }
}
