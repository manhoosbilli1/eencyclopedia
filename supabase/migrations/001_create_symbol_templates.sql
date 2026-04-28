create table symbol_library_versions (
  id serial primary key,
  version text unique,
  created_at timestamp default now()
);

create table symbol_templates (
  id text primary key,
  data jsonb,
  bounds jsonb,
  version text references symbol_library_versions(version)
);