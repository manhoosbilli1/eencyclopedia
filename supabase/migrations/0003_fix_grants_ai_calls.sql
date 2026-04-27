-- =============================================================================
-- 0003_fix_grants_ai_calls.sql
--
-- Two follow-ups to 0001 that the implementation surfaced during Day 2/3:
--
-- (a) `profiles` had an UPDATE policy ("profiles: update own") but no UPDATE
--     grant to `authenticated`. Net effect: server actions that try to
--     `.update({ username })` silently 0-row-affected. The cookie-bound
--     client never sees a violation because GRANT failures are reported as
--     "no rows updated" by PostgREST, not as PostgreSQL errors.
--
-- (b) `ai_calls` had a `read own` SELECT policy and a SELECT grant, but no
--     INSERT policy or grant for `authenticated`. Day 3's anthropic.ts logs
--     usage via the user-cookie client, which would silently fail without
--     this. We *want* user-scoped inserts because each row's `user_id` is
--     the cost-attribution key.
--
-- Both are non-destructive — they ADD privileges that the design always
-- assumed were present.
-- =============================================================================

-- (a) profiles UPDATE grant
grant update (username, display_name, avatar_url, bio, settings, updated_at)
  on public.profiles to authenticated;
-- column-level grant: prevents users from rewriting `karma`, `tier`, or `id`
-- via a forged update. The "profiles: update own" policy already requires
-- id = auth.uid(); this clamps which columns they can touch.

-- (b) ai_calls INSERT policy + grant
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ai_calls'
       and policyname = 'ai_calls: insert own'
  ) then
    create policy "ai_calls: insert own" on public.ai_calls for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

grant insert on public.ai_calls to authenticated;
-- bigserial column needs USAGE on the sequence to fill `id` on insert.
grant usage, select on sequence public.ai_calls_id_seq to authenticated;
