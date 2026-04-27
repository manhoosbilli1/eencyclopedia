-- =============================================================================
-- 0002_storage_schematics.sql
--
-- Storage bucket for user-uploaded .kicad_sch files and our rendered SVGs.
--
-- Path layout (enforced by RLS on storage.objects):
--   <user_uuid>/<schematic_uuid>.kicad_sch    -- raw upload
--   <user_uuid>/<schematic_uuid>.svg          -- pre-rendered SVG
--
-- The first path segment must equal auth.uid()::text. This stops user A from
-- writing into user B's folder via the upload API.
--
-- V0 security note (PLAN §14): the bucket is *public* — anyone holding the
-- URL can fetch the object. Access control happens at the `schematics` row
-- level via the `schematics: read public-or-own` RLS policy in 0001_init.sql.
-- For private circuits we rely on UUIDs being unguessable. Day 6+: switch to
-- a private bucket with signed URLs if we ever publish content where leakage
-- via stolen URLs is a real concern (we are not there yet).
-- =============================================================================

-- 1. Create the bucket (idempotent — safe to re-apply)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'schematics',
  'schematics',
  true,
  524288, -- 512 KiB ceiling per file. KiCad files for 5-component circuits are well under this.
  array['text/plain', 'application/octet-stream', 'application/json', 'image/svg+xml']
)
on conflict (id) do update
  set public           = excluded.public,
      file_size_limit  = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Drop any prior policies for this bucket so re-running this migration
--    leaves us with exactly the policies defined below. Not strictly
--    necessary the first time but makes the migration idempotent.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in (
         'schematics: anon read',
         'schematics: authed read',
         'schematics: insert own folder',
         'schematics: update own',
         'schematics: delete own'
       )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- 3. Read: bucket is public — allow everyone (anon + authed) to SELECT.
create policy "schematics: anon read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'schematics');

-- 4. Insert: only the owner of the path's first segment can write.
-- `(storage.foldername(name))[1]` returns the first path segment.
create policy "schematics: insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'schematics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. Update: same constraint as insert.
create policy "schematics: update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'schematics'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'schematics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 6. Delete: same constraint.
create policy "schematics: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'schematics'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
