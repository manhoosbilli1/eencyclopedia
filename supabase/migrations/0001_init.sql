-- =============================================================================
-- eencyclopedia — initial schema (V0 closed beta)
-- Migration: 0001_init.sql
-- Author: solo dev
-- Created: 2026-04-25
-- Source of truth: PLAN.md §5
-- =============================================================================

-- Required extensions ---------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";
create extension if not exists "vector";

-- =============================================================================
-- profiles
-- One row per Supabase auth user.
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (length(username) between 3 and 32 and username ~ '^[a-z0-9_-]+$'),
  display_name text,
  karma int not null default 0,
  bio text,
  avatar_url text,
  settings jsonb not null default '{
    "explanation_mode": "intuitive",
    "preferred_units": "SI",
    "ai_provider": "anthropic"
  }'::jsonb,
  tier text not null default 'free' check (tier in ('free','pro','pro_plus','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_karma_idx on public.profiles (karma desc);

-- Trigger on auth.users → create profile row -----------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- temporary username; user will pick at onboarding
    'user_' || substr(new.id::text, 1, 8),
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- components — canonical per-MPN catalogue
-- =============================================================================
create table public.components (
  id uuid primary key default gen_random_uuid(),
  mpn text not null,
  manufacturer text not null,
  family text,
  type text not null check (type in (
    'resistor','capacitor','inductor','diode','led','transistor_bjt','transistor_fet',
    'opamp','comparator','ldo','dcdc','reference','mcu','adc','dac','sensor',
    'connector','crystal','oscillator','transformer','relay','switch','fuse','generic'
  )),
  parameters jsonb not null default '{}',
  datasheet_url text,
  datasheet_sha256 text,
  embedding vector(1024),
  source text not null check (source in ('octopart','lcsc','mouser','digikey','datasheet','user','curated')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer, mpn)
);
create index components_embedding_idx on public.components using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index components_params_idx on public.components using gin (parameters);
create index components_mpn_trgm_idx on public.components using gin (mpn gin_trgm_ops);
create index components_type_idx on public.components (type);

-- =============================================================================
-- schematics — user-uploaded circuits
-- V0 cap: 5 components/circuit (component_count <= 5)
-- =============================================================================
create table public.schematics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text,
  sexp text not null,                    -- canonical eencyc-schematic S-exp
  raw_kicad_url text,                    -- original .kicad_sch in storage
  svg_url text,                          -- pre-rendered SVG with hover hooks
  thumbnail_url text,
  component_count int not null check (component_count between 0 and 5),
  visibility text not null default 'private' check (visibility in ('public','unlisted','private')),
  fork_of uuid references public.schematics(id) on delete set null,
  spice_results jsonb,                   -- last sim result cache
  ai_summary text,                       -- generated once on upload, used for RAG
  ai_summary_struct jsonb,               -- {topology,rails,intent,key_components,design_notes}
  summary_embedding vector(1024),
  star_count int not null default 0,
  fork_count int not null default 0,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(ai_summary,'')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schematics_search_idx on public.schematics using gin (search_vector);
create index schematics_owner_idx on public.schematics (owner_id);
create index schematics_public_recent_idx on public.schematics (visibility, created_at desc);
create index schematics_summary_emb_idx on public.schematics using ivfflat (summary_embedding vector_cosine_ops) with (lists = 100);

-- bridge: which components are in which schematic ------------------------------
create table public.schematic_components (
  schematic_id uuid not null references public.schematics(id) on delete cascade,
  designator text not null,              -- R1, C2, U1
  component_id uuid references public.components(id) on delete set null,
  value text,                            -- "10k", "100nF" — used when MPN is overkill
  primary key (schematic_id, designator)
);
create index schematic_components_component_idx on public.schematic_components (component_id);

-- =============================================================================
-- favorites — user's favourite components
-- =============================================================================
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  primary key (user_id, component_id)
);
create index favorites_user_idx on public.favorites (user_id, created_at desc);

-- =============================================================================
-- karma_events — additive ledger (profiles.karma is denormalised cache)
-- =============================================================================
create table public.karma_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in (
    'circuit_uploaded','circuit_starred','circuit_forked',
    'comment_upvoted','comment_downvoted','post_upvoted','post_downvoted',
    'admin_grant','admin_revoke'
  )),
  ref_id uuid,                           -- e.g. schematic_id, comment_id
  created_at timestamptz not null default now()
);
create index karma_events_user_idx on public.karma_events (user_id, created_at desc);

-- Function to recompute karma cache (call from triggers in V1) ----------------
create or replace function public.recompute_karma(p_user_id uuid)
returns void language sql as $$
  update public.profiles
     set karma = coalesce((select sum(delta) from public.karma_events where user_id = p_user_id), 0),
         updated_at = now()
   where id = p_user_id;
$$;

-- =============================================================================
-- ai_calls — per-call billing/usage meter
-- =============================================================================
create table public.ai_calls (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null check (endpoint in ('chat','router','summary','datasheet_parse','embedding','tool_call')),
  provider text not null check (provider in ('anthropic','openai','google','voyage','local')),
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  cached boolean not null default false,
  schematic_id uuid references public.schematics(id) on delete set null,
  request_meta jsonb,                    -- prompt template id, route decision, etc.
  created_at timestamptz not null default now()
);
create index ai_calls_user_recent_idx on public.ai_calls (user_id, created_at desc);
create index ai_calls_cost_idx on public.ai_calls (created_at desc, cost_usd desc);

-- Helper: today's spend per user (used to enforce daily caps) ------------------
create or replace function public.ai_spend_today(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(cost_usd), 0)
    from public.ai_calls
   where user_id = p_user_id
     and created_at >= date_trunc('day', now() at time zone 'UTC');
$$;

-- =============================================================================
-- kb_chunks — RAG knowledge base (datasheets, textbooks, summaries)
-- =============================================================================
create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in (
    'datasheet','app_note','textbook','user_circuit_summary','curated','forum_archive'
  )),
  source_id text not null,               -- e.g. "datasheet:LM358:rev_C", "schematic:<uuid>"
  content text not null,
  content_sha256 text not null,          -- dedupe key
  embedding vector(1024),
  metadata jsonb not null default '{}',  -- {manufacturer, family, page, section, license}
  created_at timestamptz not null default now(),
  unique (source_type, source_id, content_sha256)
);
create index kb_chunks_embedding_idx on public.kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 200);
create index kb_chunks_meta_idx on public.kb_chunks using gin (metadata);
create index kb_chunks_content_fts_idx on public.kb_chunks using gin (to_tsvector('english', content));

-- =============================================================================
-- ai_cache — content-hash keyed deterministic cache for AI calls
-- =============================================================================
create table public.ai_cache (
  cache_key text primary key,            -- sha256(model + prompt_template_id + serialized_inputs)
  response jsonb not null,
  hit_count int not null default 0,
  cost_saved_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index ai_cache_expires_idx on public.ai_cache (expires_at) where expires_at is not null;

-- =============================================================================
-- ai_feedback — user thumbs-up/down on AI responses (becomes training data V2+)
-- =============================================================================
create table public.ai_feedback (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ai_call_id bigint references public.ai_calls(id) on delete set null,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now()
);
create index ai_feedback_call_idx on public.ai_feedback (ai_call_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

-- profiles --------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles: read all"   on public.profiles for select using (true);
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- inserts handled by trigger (security definer)

-- components ------------------------------------------------------------------
alter table public.components enable row level security;
create policy "components: read all" on public.components for select using (true);
-- writes go through service role only (no client policy)

-- schematics ------------------------------------------------------------------
alter table public.schematics enable row level security;
create policy "schematics: read public-or-own" on public.schematics for select
  using (visibility = 'public' or visibility = 'unlisted' or owner_id = auth.uid());
create policy "schematics: insert own"  on public.schematics for insert
  with check (owner_id = auth.uid());
create policy "schematics: update own"  on public.schematics for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "schematics: delete own"  on public.schematics for delete
  using (owner_id = auth.uid());

-- schematic_components --------------------------------------------------------
alter table public.schematic_components enable row level security;
create policy "sc: read if schematic readable" on public.schematic_components for select
  using (exists (select 1 from public.schematics s
                 where s.id = schematic_id
                   and (s.visibility in ('public','unlisted') or s.owner_id = auth.uid())));
create policy "sc: write if schematic owned" on public.schematic_components for all
  using (exists (select 1 from public.schematics s
                 where s.id = schematic_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.schematics s
                      where s.id = schematic_id and s.owner_id = auth.uid()));

-- favorites -------------------------------------------------------------------
alter table public.favorites enable row level security;
create policy "favorites: read own"  on public.favorites for select
  using (user_id = auth.uid());
create policy "favorites: write own" on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- karma_events ----------------------------------------------------------------
alter table public.karma_events enable row level security;
create policy "karma: read all" on public.karma_events for select using (true);
-- writes via service role only

-- ai_calls --------------------------------------------------------------------
alter table public.ai_calls enable row level security;
create policy "ai_calls: read own" on public.ai_calls for select
  using (user_id = auth.uid());
-- inserts via service role from edge functions

-- kb_chunks -------------------------------------------------------------------
alter table public.kb_chunks enable row level security;
create policy "kb: read all" on public.kb_chunks for select using (true);
-- writes via service role only

-- ai_cache --------------------------------------------------------------------
alter table public.ai_cache enable row level security;
-- no client access; service role only

-- ai_feedback -----------------------------------------------------------------
alter table public.ai_feedback enable row level security;
create policy "feedback: read own"  on public.ai_feedback for select
  using (user_id = auth.uid());
create policy "feedback: write own" on public.ai_feedback for insert
  with check (user_id = auth.uid());

-- =============================================================================
-- updated_at triggers
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_set_updated_at   before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger components_set_updated_at before update on public.components
  for each row execute function public.set_updated_at();
create trigger schematics_set_updated_at before update on public.schematics
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Grants — restrict anon and authenticated to RLS-protected tables only.
-- Service role retains full access.
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.components, public.schematics,
                public.schematic_components, public.kb_chunks,
                public.karma_events
  to anon, authenticated;
grant insert, update, delete on public.schematics, public.schematic_components,
                                  public.favorites, public.ai_feedback
  to authenticated;
grant select, insert, update, delete on public.favorites, public.ai_feedback to authenticated;
grant select on public.ai_calls to authenticated;
