-- Suggestions box. Public read; authenticated users post + upvote.
-- Mirrors the migration applied via the MCP apply_migration call.

create table if not exists public.suggestions (
  id          uuid        primary key default gen_random_uuid(),
  author_id   uuid        not null references auth.users(id) on delete cascade,
  title       text        not null check (char_length(title) between 3 and 200),
  body        text        check (body is null or char_length(body) between 1 and 4000),
  status      text        not null default 'open'
                check (status in ('open','planned','in_progress','done','wont_do')),
  upvotes     int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists suggestions_recent_idx   on public.suggestions (created_at desc);
create index if not exists suggestions_upvotes_idx  on public.suggestions (upvotes desc, created_at desc);

drop trigger if exists suggestions_set_updated_at on public.suggestions;
create trigger suggestions_set_updated_at
  before update on public.suggestions
  for each row execute function public.set_updated_at();

create table if not exists public.suggestion_upvotes (
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create or replace function public.bump_suggestion_upvote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.suggestions set upvotes = upvotes + 1 where id = new.suggestion_id;
  return new;
end $$;

drop trigger if exists suggestion_upvote_insert on public.suggestion_upvotes;
create trigger suggestion_upvote_insert
  after insert on public.suggestion_upvotes
  for each row execute function public.bump_suggestion_upvote();

create or replace function public.unbump_suggestion_upvote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.suggestions
     set upvotes = greatest(0, upvotes - 1)
   where id = old.suggestion_id;
  return old;
end $$;

drop trigger if exists suggestion_upvote_delete on public.suggestion_upvotes;
create trigger suggestion_upvote_delete
  after delete on public.suggestion_upvotes
  for each row execute function public.unbump_suggestion_upvote();

alter table public.suggestions enable row level security;
drop policy if exists "suggestions: read all"     on public.suggestions;
drop policy if exists "suggestions: insert auth"  on public.suggestions;
drop policy if exists "suggestions: update own"   on public.suggestions;
drop policy if exists "suggestions: delete own"   on public.suggestions;
create policy "suggestions: read all"     on public.suggestions for select using (true);
create policy "suggestions: insert auth"  on public.suggestions for insert with check (auth.uid() = author_id);
create policy "suggestions: update own"   on public.suggestions for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "suggestions: delete own"   on public.suggestions for delete using (auth.uid() = author_id);

alter table public.suggestion_upvotes enable row level security;
drop policy if exists "upvotes: read all"   on public.suggestion_upvotes;
drop policy if exists "upvotes: insert own" on public.suggestion_upvotes;
drop policy if exists "upvotes: delete own" on public.suggestion_upvotes;
create policy "upvotes: read all"   on public.suggestion_upvotes for select using (true);
create policy "upvotes: insert own" on public.suggestion_upvotes for insert with check (auth.uid() = user_id);
create policy "upvotes: delete own" on public.suggestion_upvotes for delete using (auth.uid() = user_id);

grant select on public.suggestions, public.suggestion_upvotes to anon, authenticated;
grant insert, update, delete on public.suggestions, public.suggestion_upvotes to authenticated;
