/**
 * Temporary handwritten Supabase types.
 *
 * Replace this file by running:
 *   pnpm db:types
 *
 * This keeps the repo's placeholder phase usable under `strict` until the
 * real generated types are pulled from the linked project.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Vector = number[];

export type Database = {
  public: {
    Tables: {
      ai_cache: {
        Row: {
          cache_key: string;
          response: Json;
          hit_count: number;
          cost_saved_usd: number;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          cache_key: string;
          response: Json;
          hit_count?: number;
          cost_saved_usd?: number;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          cache_key?: string;
          response?: Json;
          hit_count?: number;
          cost_saved_usd?: number;
          created_at?: string;
          expires_at?: string | null;
        };
      };
      ai_calls: {
        Row: {
          id: number;
          user_id: string;
          endpoint: string;
          provider: string;
          model: string;
          tokens_in: number;
          tokens_out: number;
          cost_usd: number;
          cached: boolean;
          schematic_id: string | null;
          request_meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          endpoint: string;
          provider: string;
          model: string;
          tokens_in?: number;
          tokens_out?: number;
          cost_usd?: number;
          cached?: boolean;
          schematic_id?: string | null;
          request_meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          endpoint?: string;
          provider?: string;
          model?: string;
          tokens_in?: number;
          tokens_out?: number;
          cost_usd?: number;
          cached?: boolean;
          schematic_id?: string | null;
          request_meta?: Json | null;
          created_at?: string;
        };
      };
      ai_feedback: {
        Row: {
          id: number;
          user_id: string;
          ai_call_id: number | null;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          ai_call_id?: number | null;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          ai_call_id?: number | null;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
      };
      components: {
        Row: {
          id: string;
          mpn: string;
          manufacturer: string;
          family: string | null;
          type: string;
          parameters: Json;
          datasheet_url: string | null;
          datasheet_sha256: string | null;
          embedding: Vector | null;
          source: string;
          verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mpn: string;
          manufacturer: string;
          family?: string | null;
          type: string;
          parameters?: Json;
          datasheet_url?: string | null;
          datasheet_sha256?: string | null;
          embedding?: Vector | null;
          source: string;
          verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mpn?: string;
          manufacturer?: string;
          family?: string | null;
          type?: string;
          parameters?: Json;
          datasheet_url?: string | null;
          datasheet_sha256?: string | null;
          embedding?: Vector | null;
          source?: string;
          verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      favorites: {
        Row: {
          user_id: string;
          component_id: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          component_id: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          component_id?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      karma_events: {
        Row: {
          id: number;
          user_id: string;
          delta: number;
          reason: string;
          ref_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          delta: number;
          reason: string;
          ref_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          delta?: number;
          reason?: string;
          ref_id?: string | null;
          created_at?: string;
        };
      };
      kb_chunks: {
        Row: {
          id: string;
          source_type: string;
          source_id: string;
          content: string;
          content_sha256: string;
          embedding: Vector | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_type: string;
          source_id: string;
          content: string;
          content_sha256: string;
          embedding?: Vector | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_type?: string;
          source_id?: string;
          content?: string;
          content_sha256?: string;
          embedding?: Vector | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          karma: number;
          bio: string | null;
          avatar_url: string | null;
          settings: Json;
          tier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          karma?: number;
          bio?: string | null;
          avatar_url?: string | null;
          settings?: Json;
          tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          karma?: number;
          bio?: string | null;
          avatar_url?: string | null;
          settings?: Json;
          tier?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      schematic_components: {
        Row: {
          schematic_id: string;
          designator: string;
          component_id: string | null;
          value: string | null;
        };
        Insert: {
          schematic_id: string;
          designator: string;
          component_id?: string | null;
          value?: string | null;
        };
        Update: {
          schematic_id?: string;
          designator?: string;
          component_id?: string | null;
          value?: string | null;
        };
      };
      schematics: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          sexp: string;
          raw_kicad_url: string | null;
          svg_url: string | null;
          thumbnail_url: string | null;
          component_count: number;
          visibility: 'public' | 'unlisted' | 'private';
          fork_of: string | null;
          spice_results: Json | null;
          ai_summary: string | null;
          ai_summary_struct: Json | null;
          summary_embedding: Vector | null;
          star_count: number;
          fork_count: number;
          search_vector: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          sexp: string;
          raw_kicad_url?: string | null;
          svg_url?: string | null;
          thumbnail_url?: string | null;
          component_count?: number;
          visibility?: 'public' | 'unlisted' | 'private';
          fork_of?: string | null;
          spice_results?: Json | null;
          ai_summary?: string | null;
          ai_summary_struct?: Json | null;
          summary_embedding?: Vector | null;
          star_count?: number;
          fork_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          sexp?: string;
          raw_kicad_url?: string | null;
          svg_url?: string | null;
          thumbnail_url?: string | null;
          component_count?: number;
          visibility?: 'public' | 'unlisted' | 'private';
          fork_of?: string | null;
          spice_results?: Json | null;
          ai_summary?: string | null;
          ai_summary_struct?: Json | null;
          summary_embedding?: Vector | null;
          star_count?: number;
          fork_count?: number;
          search_vector?: unknown;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      ai_spend_today: {
        Args: { p_user_id: string };
        Returns: number;
      };
      match_kb_chunks: {
        Args: { query_embedding: number[]; match_count?: number };
        Returns: {
          id: string;
          source_type: string;
          source_id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      recompute_karma: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
