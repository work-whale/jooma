-- Jooma 4.5: the hero's reassurance line. The admin-editable copy block on
-- both staging and production still promised "Three days free on every plan",
-- which stops being true when the 10-day Pro trial ships (spec Step 4, rule 6:
-- remove every "3 days free" line). Only replaced while it still says the old
-- thing, so an edit made in /admin/copy in the meantime is kept.
update copy_blocks
   set value = 'Ten days of Pro free. No card, nothing to cancel.', updated_at = now()
 where key = 'home.hero.reassure'
   and value = 'Three days free on every plan. Cancel any time before it ends.';
