-- =============================================================================
-- 0006_raise_component_cap.sql
--
-- Originally 0001_init capped `schematics.component_count` at 5 (V0 conservative
-- ceiling per PLAN §2). With the renderer's lib_symbols pin alignment + glyph
-- auto-scale shipped, we can comfortably handle larger circuits — bump to 50
-- so a real op-amp stage (5–6 parts) or MCU minimum-boot (8–10 parts) fits.
--
-- Postgres CHECK constraints can't be altered in place; we DROP + ADD.
-- =============================================================================

alter table public.schematics
  drop constraint if exists schematics_component_count_check;

alter table public.schematics
  add constraint schematics_component_count_check
    check (component_count between 0 and 50);
