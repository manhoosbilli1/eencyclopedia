-- =============================================================================
-- Stars (circuit likes) + Comments
-- Migration: 0008_stars_and_comments.sql
-- =============================================================================

-- circuit_stars ---------------------------------------------------------------
-- Tracks who starred which circuit. star_count on schematics is the cached
-- denormalised counter, maintained by triggers below.
create table if not exists public.circuit_stars (
  user_id      uuid not null references public.profiles(id)   on delete cascade,
  schematic_id uuid not null references public.schematics(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, schematic_id)
);
create index circuit_stars_schematic_idx on public.circuit_stars (schematic_id, created_at desc);

-- Keep schematics.star_count in sync -----------------------------------------
create or replace function public.update_star_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.schematics set star_count = star_count + 1 where id = new.schematic_id;
  elsif tg_op = 'DELETE' then
    update public.schematics set star_count = greatest(0, star_count - 1) where id = old.schematic_id;
  end if;
  return null;
end $$;

create trigger circuit_stars_sync
  after insert or delete on public.circuit_stars
  for each row execute function public.update_star_count();

-- Also fire karma_events on star -----------------------------------------------
create or replace function public.handle_circuit_star()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select owner_id into v_owner from public.schematics where id = new.schematic_id;
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.karma_events (user_id, delta, reason, ref_id)
        values (v_owner, 1, 'circuit_starred', new.schematic_id);
      perform public.recompute_karma(v_owner);
    end if;
  end if;
  return null;
end $$;

create trigger circuit_star_karma
  after insert on public.circuit_stars
  for each row execute function public.handle_circuit_star();

-- RLS -------------------------------------------------------------------------
alter table public.circuit_stars enable row level security;
create policy "stars: read all"   on public.circuit_stars for select using (true);
create policy "stars: insert own" on public.circuit_stars for insert
  with check (user_id = auth.uid());
create policy "stars: delete own" on public.circuit_stars for delete
  using (user_id = auth.uid());

grant select on public.circuit_stars to anon, authenticated;
grant insert, delete on public.circuit_stars to authenticated;

-- circuit_comments ------------------------------------------------------------
create table if not exists public.circuit_comments (
  id           uuid primary key default gen_random_uuid(),
  schematic_id uuid not null references public.schematics(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)   on delete cascade,
  parent_id    uuid references public.circuit_comments(id)    on delete cascade,
  content      text not null check (length(content) between 1 and 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index circuit_comments_schematic_idx on public.circuit_comments
  (schematic_id, created_at asc) where parent_id is null;
create index circuit_comments_parent_idx    on public.circuit_comments (parent_id);

-- updated_at trigger ----------------------------------------------------------
create trigger circuit_comments_updated_at
  before update on public.circuit_comments
  for each row execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------
alter table public.circuit_comments enable row level security;
-- Anyone can read comments on public circuits; owner can read comments on own private
create policy "comments: read if circuit readable" on public.circuit_comments for select
  using (exists (
    select 1 from public.schematics s
    where s.id = schematic_id
      and (s.visibility in ('public','unlisted') or s.owner_id = auth.uid())
  ));
create policy "comments: insert authed" on public.circuit_comments for insert
  with check (user_id = auth.uid());
create policy "comments: delete own"    on public.circuit_comments for delete
  using (user_id = auth.uid());

grant select on public.circuit_comments to anon, authenticated;
grant insert, delete on public.circuit_comments to authenticated;
