-- =============================================================================
-- 0013_storage_size_limit_5mib.sql
--
-- Bump the schematics storage bucket file-size cap from 512 KiB → 5 MiB.
--
-- Real-world KiCad uploads embed the full lib_symbols block (body shapes,
-- pin geometry, properties) for every part on the sheet, so the .kicad_sch
-- comes in at 1–4 MiB for a 100-component reference design (e.g. the
-- daanmem ESP32 schematic that triggered this — 1.6 MiB raw). The 512 KiB
-- ceiling we picked in 0002 was sized for trivial 5-component circuits and
-- now blocks legitimate uploads with the message:
--     "Storage upload failed: The object exceeded the maximum allowed size"
--
-- 5 MiB still leaves headroom over the schematics.component_count cap
-- (MAX_COMPONENTS_V0 = 200, migration 0011): even the most lib_symbol-heavy
-- 200-component circuit lands well under 5 MiB.
-- =============================================================================

update storage.buckets
   set file_size_limit = 5242880  -- 5 MiB
 where id = 'schematics';
