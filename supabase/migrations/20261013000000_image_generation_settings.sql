-- AI image quality and price, editable from /admin/tools.
--
-- Data only: one app_settings row, no schema change. The admin card writes it
-- through the existing admin_set_setting() RPC (admin-checked and audit
-- logged), and app/lib/image-settings.ts reads it with a 60s cache. Until this
-- row exists the code runs on the same values as its own defaults
-- (DEFAULT_IMAGE_SETTINGS in app/lib/image-quality.ts), so pushing it changes
-- nothing on its own; it only makes the card saveable.
--
-- Quality per use: the slideshow's title image stays medium, its other images
-- go to low, single images from the editor stay medium.
--
-- Prices in USD per image. Medium is calibrated to the OpenAI console; low and
-- high are that figure scaled by OpenAI's token ratio for gpt-image-1, to be
-- checked against the console from the admin card.
--
-- Section 'images' is hidden on /admin/settings: the Tools page is its only
-- editor. Not added to public_settings(): nothing signed out needs it.

insert into public.app_settings (key, label, description, section, value, sort)
values
  ('image_generation', 'AI image quality and price',
   'Quality for each kind of AI image and the USD price each is recorded at. Edited on the Tools page.',
   'images',
   '{
      "title": "medium",
      "slide": "low",
      "single": "medium",
      "costUsd": {
        "1024x1024": {"low": 0.004, "medium": 0.015, "high": 0.059},
        "1536x1024": {"low": 0.006, "medium": 0.022, "high": 0.087},
        "1024x1536": {"low": 0.006, "medium": 0.022, "high": 0.087}
      }
    }'::jsonb,
   30)
on conflict (key) do nothing;


-- ── Verify after pushing ────────────────────────────────────────────────────
-- select key, section, value->>'slide' from app_settings where key = 'image_generation';
--   -- image_generation | images | low
