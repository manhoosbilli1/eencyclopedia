-- Bumps the schematics.component_count constraint from 50 → 200 so a full
-- reference-design upload (MCU + crystal + decoupling + connectors + power
-- tree) fits without forcing the user to crop. Bigger projects should still
-- use the bounding-box ingest to share a curated sub-circuit.

alter table public.schematics
  drop constraint if exists schematics_component_count_check;

alter table public.schematics
  add constraint schematics_component_count_check
    check (component_count between 0 and 200);
