-- =============================================================================
-- 0010_fork_lineage.sql
--
-- Closed-beta requirement: any user can edit any visible circuit, but saving
-- creates a SPINOFF (fork) that links back to the original via fork_of and
-- to the very first ancestor via fork_root_id. The detail page renders a
-- breadcrumb so credit + lineage are visible.
--
-- 0001 already added fork_of + fork_count. This migration adds fork_root_id,
-- a trigger to auto-set it on insert, a trigger to bump the parent's
-- fork_count, and indexes for the breadcrumb queries.
-- =============================================================================

alter table public.schematics
  add column if not exists fork_root_id uuid
    references public.schematics(id) on delete set null;

create index if not exists schematics_fork_of_idx       on public.schematics (fork_of);
create index if not exists schematics_fork_root_idx     on public.schematics (fork_root_id);

-- Backfill existing rows. For each row with fork_of set, walk the chain
-- back to the ancestor whose fork_of is null and copy its id.
update public.schematics s
set fork_root_id = (
  with recursive chain as (
    select id, fork_of from public.schematics where id = s.fork_of
    union all
    select p.id, p.fork_of
      from public.schematics p
      join chain c on p.id = c.fork_of
  )
  select id from chain where fork_of is null limit 1
)
where fork_of is not null and fork_root_id is null;

-- Trigger: when inserting a fork, derive fork_root_id from the parent.
create or replace function public.set_fork_root()
returns trigger language plpgsql as $$
begin
  if new.fork_of is not null and new.fork_root_id is null then
    select coalesce(parent.fork_root_id, parent.id)
      into new.fork_root_id
      from public.schematics parent
     where parent.id = new.fork_of;
  end if;
  return new;
end $$;

drop trigger if exists schematics_set_fork_root on public.schematics;
create trigger schematics_set_fork_root
  before insert on public.schematics
  for each row execute function public.set_fork_root();

-- Trigger: increment the parent's fork_count when a child is inserted.
-- We use security definer so RLS doesn't block updating someone else's row.
create or replace function public.bump_fork_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fork_of is not null then
    update public.schematics
       set fork_count = coalesce(fork_count, 0) + 1
     where id = new.fork_of;
  end if;
  return new;
end $$;

drop trigger if exists schematics_bump_fork_count on public.schematics;
create trigger schematics_bump_fork_count
  after insert on public.schematics
  for each row execute function public.bump_fork_count();

-- Decrement fork_count on delete so counts stay accurate when forks are
-- cleaned up. Same security definer rationale as the bump trigger.
create or replace function public.unbump_fork_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.fork_of is not null then
    update public.schematics
       set fork_count = greatest(0, coalesce(fork_count, 0) - 1)
     where id = old.fork_of;
  end if;
  return old;
end $$;

drop trigger if exists schematics_unbump_fork_count on public.schematics;
create trigger schematics_unbump_fork_count
  after delete on public.schematics
  for each row execute function public.unbump_fork_count();
