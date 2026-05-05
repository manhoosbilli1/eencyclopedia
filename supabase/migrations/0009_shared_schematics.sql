-- =============================================================================
-- Shared (scratch) schematics — created from the in-browser editor.
-- Migration: 0009_shared_schematics.sql
-- =============================================================================

-- shared_schematics -----------------------------------------------------------
-- Stores schematics created from scratch in the browser editor (not uploaded
-- .kicad_sch files). state_json holds the raw EditorState JSON.
create table if not exists public.shared_schematics (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique not null,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Untitled Schematic',
  state_json  text        not null,
  likes       int         not null default 0,
  stars       int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index shared_schematics_owner_idx  on public.shared_schematics (owner_id, created_at desc);
create index shared_schematics_slug_idx   on public.shared_schematics (slug);

-- updated_at trigger ----------------------------------------------------------
create trigger shared_schematics_updated_at
  before update on public.shared_schematics
  for each row execute function public.set_updated_at();

-- schematic_comments ----------------------------------------------------------
create table if not exists public.schematic_comments (
  id            uuid        primary key default gen_random_uuid(),
  schematic_id  uuid        not null references public.shared_schematics(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  text          text        not null check (char_length(text) between 1 and 2000),
  created_at    timestamptz not null default now()
);

create index schematic_comments_schematic_idx on public.schematic_comments (schematic_id, created_at asc);

-- RLS -------------------------------------------------------------------------
alter table public.shared_schematics enable row level security;

create policy "shared_schematics: public read"
  on public.shared_schematics for select
  using (true);

create policy "shared_schematics: owner insert"
  on public.shared_schematics for insert
  with check (auth.uid() = owner_id);

create policy "shared_schematics: owner update"
  on public.shared_schematics for update
  using (auth.uid() = owner_id);

create policy "shared_schematics: owner delete"
  on public.shared_schematics for delete
  using (auth.uid() = owner_id);

alter table public.schematic_comments enable row level security;

create policy "schematic_comments: public read"
  on public.schematic_comments for select
  using (true);

create policy "schematic_comments: auth insert"
  on public.schematic_comments for insert
  with check (auth.uid() = user_id);

create policy "schematic_comments: own delete"
  on public.schematic_comments for delete
  using (auth.uid() = user_id);

-- Grants ----------------------------------------------------------------------
grant select on public.shared_schematics to anon, authenticated;
grant insert, update, delete on public.shared_schematics to authenticated;

grant select on public.schematic_comments to anon, authenticated;
grant insert, delete on public.schematic_comments to authenticated;
