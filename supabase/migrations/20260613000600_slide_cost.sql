-- Per-slide all-in cost for slideshows: even share of the deck-text call + that
-- slide's image cost (+ audio on the audio slide). A separate lens from the
-- token_usage/asset_cost accounting tables, so it never affects tool totals —
-- it only powers the per-slide breakdown on the admin Usage page.
create table if not exists slide_cost (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  tool_slug text not null default 'generate-slideshow',
  slide_label text not null,
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);
alter table slide_cost enable row level security;
create index slide_cost_user_idx on slide_cost (user_id, created_at desc);

create policy "own slide cost read" on slide_cost for select using (auth.uid() = user_id);
create policy "own slide cost insert" on slide_cost for insert with check (auth.uid() = user_id);
create policy "own slide cost delete" on slide_cost for delete using (auth.uid() = user_id);

create or replace function admin_slide_costs()
returns table (slide_label text, cost_usd numeric, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  -- One row per slideshow generation (deck title + all-in cost), newest first.
  return query
    select sc.slide_label, sc.cost_usd, sc.created_at
    from slide_cost sc
    where sc.created_at >= date_trunc('month', now())
    order by sc.created_at desc;
end;
$$;
grant execute on function admin_slide_costs() to authenticated;

-- Reset also clears the per-slide lens for the slideshow.
create or replace function admin_reset_tool_usage(slugs text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  delete from token_usage where tool_slug = any(slugs);
  delete from asset_cost where tool_slug = any(slugs);
  if 'generate-slideshow' = any(slugs) then
    delete from slide_cost;
  end if;
end;
$$;
grant execute on function admin_reset_tool_usage(text[]) to authenticated;
