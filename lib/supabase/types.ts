/**
 * Generated DB types placeholder.
 *
 * Replace this file by running:
 *   pnpm db:types
 * which calls `supabase gen types typescript --project-id $SUPABASE_PROJECT_REF`
 * after the migration is applied. Until then, we ship a permissive `Database`
 * shape so TS compiles.
 *
 * DO NOT hand-edit the generated output once `pnpm db:types` exists —
 * regenerate after every migration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
};
