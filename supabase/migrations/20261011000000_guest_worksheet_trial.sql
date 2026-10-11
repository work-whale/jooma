-- Worksheets join the free tries on the landing hero.
--
-- A signed out visitor can now make a worksheet from /create, alongside Slides
-- and Comprehension, within the same three tries a day. The work is kept in
-- trial_generations like the other two, so the tool check has to allow it.
-- Nothing else changes: admin_guest_try_stats() already counts
-- 'worksheet-generator', and use_trial_jo_prompt() works for any tool.

alter table public.trial_generations drop constraint if exists trial_generations_tool_check;
alter table public.trial_generations
  add constraint trial_generations_tool_check
  check (tool in ('slideshow', 'comprehension-generator', 'worksheet-generator'));

-- The admin switch's description named the two old tools. Guarded on the exact
-- previous value so a hand edit in /admin is left alone.
update public.app_settings
   set description = 'Lets signed out visitors make Slides, Comprehensions and Worksheets from the hero, three free tries a day.'
 where key = 'trial_enabled'
   and description = 'Lets signed out visitors make one Slides deck and one Comprehension a day from the hero.';


-- ── Verify after pushing ────────────────────────────────────────────────────
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conname = 'trial_generations_tool_check';   -- lists worksheet-generator
