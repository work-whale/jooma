-- Ask Jo, the editor: Jo working on a resource the teacher has generated.
--
-- Three things:
--
--   1. jo_threads / jo_messages: each document's conversation with Jo, so
--      reopening a deck or a worksheet brings the chat back. Owner scoped RLS,
--      modelled on assistant_chats (20260821000000): a thread belongs to one
--      teacher and holds nothing anyone else should see.
--   2. trial_generations.jo_prompts and use_trial_jo_prompt(): a visitor on a
--      free try gets a few messages to Jo per generation. Counted on the
--      server, reserved before the model is called, so neither a cleared
--      cookie nor a burst of requests gets past the limit.
--   3. a tool_settings row for 'jo', so an admin can retarget the model
--      without a deploy, like every other AI route.

-- ── 1. Threads ──────────────────────────────────────────────────────────────

create table if not exists public.jo_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- What the thread is about. Not a foreign key: it can point at either table,
  -- and an orphaned thread after a delete is harmless (it is never listed on
  -- its own, only loaded beside its document).
  doc_kind   text not null check (doc_kind in ('presentation', 'tool_run')),
  doc_id     uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, doc_kind, doc_id)
);

create table if not exists public.jo_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.jo_threads (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- An assistant turn's follow up question, its edits (label and where each
  -- landed) and its closing summary. Null on a teacher's turn.
  clarify    jsonb,
  ops        jsonb,
  summary    text,
  created_at timestamptz not null default now()
);

alter table public.jo_threads enable row level security;
alter table public.jo_messages enable row level security;

create index if not exists jo_messages_thread_idx on public.jo_messages (thread_id, created_at);
-- Covering indexes for the user_id foreign keys, per 20260805002000.
create index if not exists jo_messages_user_idx on public.jo_messages (user_id);

-- auth.uid() in a scalar subselect: evaluated once per query, not per row.
drop policy if exists "own jo threads read" on public.jo_threads;
create policy "own jo threads read" on public.jo_threads
  for select using ((select auth.uid()) = user_id);
drop policy if exists "own jo threads insert" on public.jo_threads;
create policy "own jo threads insert" on public.jo_threads
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "own jo threads delete" on public.jo_threads;
create policy "own jo threads delete" on public.jo_threads
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "own jo messages read" on public.jo_messages;
create policy "own jo messages read" on public.jo_messages
  for select using ((select auth.uid()) = user_id);
-- A message may only go into one of the teacher's own threads.
drop policy if exists "own jo messages insert" on public.jo_messages;
create policy "own jo messages insert" on public.jo_messages
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.jo_threads t
       where t.id = thread_id and t.user_id = (select auth.uid())
    )
  );
drop policy if exists "own jo messages delete" on public.jo_messages;
create policy "own jo messages delete" on public.jo_messages
  for delete using ((select auth.uid()) = user_id);
-- No update policies: a sent message is a record, and a thread has nothing to
-- edit. updated_at is kept by the trigger below.

grant select, insert, delete on public.jo_threads to authenticated;
grant select, insert, delete on public.jo_messages to authenticated;

create or replace function public.touch_jo_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jo_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.touch_jo_thread() from public, anon, authenticated;

drop trigger if exists jo_messages_touch on public.jo_messages;
create trigger jo_messages_touch
  after insert on public.jo_messages
  for each row execute function public.touch_jo_thread();

-- ── 2. Free try prompts ─────────────────────────────────────────────────────

alter table public.trial_generations
  add column if not exists jo_prompts smallint not null default 0;

-- Use one of a free try's prompts, or give one back.
--
-- Called by /api/try/jo with the service role only, after it has checked the
-- signed guest cookie. trial_generations has no policies and no grants by
-- design (see 20261005000000), so this is granted to service_role and nobody
-- else: anon must never be able to reset or spend a count.
--
-- Using is one conditional update, so two requests at the same moment cannot
-- both take the last prompt. Returns the number used and the run's id (which
-- the spend is recorded against), or no row when the limit is reached or the
-- run is not this guest's. A refund never goes below zero.
create or replace function public.use_trial_jo_prompt(
  p_id uuid,
  p_guest uuid,
  p_max integer,
  p_refund boolean default false
)
returns table (used integer, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_refund then
    return query
      update public.trial_generations t
         set jo_prompts = greatest(t.jo_prompts - 1, 0)
       where t.id = p_id and t.guest_id = p_guest
      returning t.jo_prompts::integer, t.run_id;
  else
    return query
      update public.trial_generations t
         set jo_prompts = t.jo_prompts + 1
       where t.id = p_id
         and t.guest_id = p_guest
         and t.status in ('done', 'claimed')
         and t.jo_prompts < p_max
      returning t.jo_prompts::integer, t.run_id;
  end if;
end;
$$;

revoke all on function public.use_trial_jo_prompt(uuid, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.use_trial_jo_prompt(uuid, uuid, integer, boolean) to service_role;

-- ── 3. Admin model console ──────────────────────────────────────────────────

insert into public.tool_settings (slug, display_name, enabled, kind, model, effort, verbosity)
values ('jo', 'Ask Jo editor', true, 'utility', 'gpt-5.6-luna', 'low', 'medium')
on conflict (slug) do nothing;
