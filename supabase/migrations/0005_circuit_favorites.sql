-- =============================================================================
-- 0005_circuit_favorites.sql
--
-- The existing `favorites` table from 0001_init keys on (user_id, component_id)
-- — that's per-MPN component favoriting, useful when the parts catalogue
-- exists. But V0's user-facing reality is that we have circuits, not parts:
-- people upload .kicad_sch files and want to bookmark those they care about.
--
-- This migration adds a parallel `circuit_favorites` table with the same
-- shape but pointing at `schematics`. Two reasons not to touch the existing
-- `favorites` table:
--   1. It's already covered by RLS + grants from 0001 — repurposing would
--      mean rewriting policies and risking permission regressions.
--   2. The two are semantically different (parts vs circuits) — they may
--      coexist permanently with their own UIs (/favorites for circuits,
--      /favorites/parts later for components).
-- =============================================================================

create table if not exists public.circuit_favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  circuit_id  uuid not null references public.schematics(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, circuit_id)
);

create index if not exists circuit_favorites_user_idx
  on public.circuit_favorites (user_id, created_at desc);
create index if not exists circuit_favorites_circuit_idx
  on public.circuit_favorites (circuit_id);

alter table public.circuit_favorites enable row level security;

-- Read: only your own favorites (ie, who you've starred — private to you)
drop policy if exists "circuit_favorites: read own" on public.circuit_favorites;
create policy "circuit_favorites: read own"
  on public.circuit_favorites for select
  to authenticated
  using (user_id = auth.uid());

-- Write: only your own favorites
drop policy if exists "circuit_favorites: write own" on public.circuit_favorites;
create policy "circuit_favorites: write own"
  on public.circuit_favorites for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on public.circuit_favorites to authenticated;
