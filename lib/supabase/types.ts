// Auto-generated from Supabase — do not edit by hand.
// Regenerate: pnpm db:types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_cache: {
        Row: {
          cache_key: string
          cost_saved_usd: number
          created_at: string
          expires_at: string | null
          hit_count: number
          response: Json
        }
        Insert: {
          cache_key: string
          cost_saved_usd?: number
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          response: Json
        }
        Update: {
          cache_key?: string
          cost_saved_usd?: number
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          response?: Json
        }
        Relationships: []
      }
      ai_calls: {
        Row: {
          cached: boolean
          cost_usd: number
          created_at: string
          endpoint: string
          id: number
          model: string
          provider: string
          request_meta: Json | null
          schematic_id: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          cached?: boolean
          cost_usd?: number
          created_at?: string
          endpoint: string
          id?: number
          model: string
          provider: string
          request_meta?: Json | null
          schematic_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          cached?: boolean
          cost_usd?: number
          created_at?: string
          endpoint?: string
          id?: number
          model?: string
          provider?: string
          request_meta?: Json | null
          schematic_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          ai_call_id: number | null
          comment: string | null
          created_at: string
          id: number
          rating: number
          user_id: string
        }
        Insert: {
          ai_call_id?: number | null
          comment?: string | null
          created_at?: string
          id?: number
          rating: number
          user_id: string
        }
        Update: {
          ai_call_id?: number | null
          comment?: string | null
          created_at?: string
          id?: number
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          schematic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          schematic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          schematic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "circuit_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_comments_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_favorites: {
        Row: {
          circuit_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          circuit_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          circuit_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_favorites_circuit_id_fkey"
            columns: ["circuit_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_stars: {
        Row: {
          created_at: string
          schematic_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          schematic_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          schematic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_stars_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_stars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          created_at: string
          datasheet_sha256: string | null
          datasheet_url: string | null
          embedding: string | null
          family: string | null
          id: string
          manufacturer: string
          mpn: string
          parameters: Json
          source: string
          type: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          datasheet_sha256?: string | null
          datasheet_url?: string | null
          embedding?: string | null
          family?: string | null
          id?: string
          manufacturer: string
          mpn: string
          parameters?: Json
          source: string
          type: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          datasheet_sha256?: string | null
          datasheet_url?: string | null
          embedding?: string | null
          family?: string | null
          id?: string
          manufacturer?: string
          mpn?: string
          parameters?: Json
          source?: string
          type?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      favorites: {
        Row: {
          component_id: string
          created_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      karma_events: {
        Row: {
          created_at: string
          delta: number
          id: number
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: number
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: number
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "karma_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          content: string
          content_sha256: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          source_id: string
          source_type: string
        }
        Insert: {
          content: string
          content_sha256: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id: string
          source_type: string
        }
        Update: {
          content?: string
          content_sha256?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id?: string
          source_type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          karma: number
          settings: Json
          tier: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          karma?: number
          settings?: Json
          tier?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          karma?: number
          settings?: Json
          tier?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      schematic_comments: {
        Row: {
          created_at: string
          id: string
          schematic_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          schematic_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          schematic_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schematic_comments_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "shared_schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schematic_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schematic_components: {
        Row: {
          component_id: string | null
          designator: string
          schematic_id: string
          value: string | null
        }
        Insert: {
          component_id?: string | null
          designator: string
          schematic_id: string
          value?: string | null
        }
        Update: {
          component_id?: string | null
          designator?: string
          schematic_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schematic_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schematic_components_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_schematics: {
        Row: {
          created_at: string
          id: string
          likes: number
          owner_id: string
          slug: string
          stars: number
          state_json: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          likes?: number
          owner_id: string
          slug: string
          stars?: number
          state_json: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          likes?: number
          owner_id?: string
          slug?: string
          stars?: number
          state_json?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_schematics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_upvotes: {
        Row: {
          created_at: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_upvotes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          id: string
          status: string
          title: string
          updated_at: string
          upvotes: number
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          upvotes?: number
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          upvotes?: number
        }
        Relationships: []
      }
      schematics: {
        Row: {
          ai_summary: string | null
          ai_summary_struct: Json | null
          component_count: number
          created_at: string
          description: string | null
          fork_count: number
          fork_of: string | null
          fork_root_id: string | null
          id: string
          owner_id: string
          raw_kicad_url: string | null
          search_vector: unknown
          sexp: string
          spice_results: Json | null
          star_count: number
          summary_embedding: string | null
          svg_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_struct?: Json | null
          component_count: number
          created_at?: string
          description?: string | null
          fork_count?: number
          fork_of?: string | null
          fork_root_id?: string | null
          id?: string
          owner_id: string
          raw_kicad_url?: string | null
          search_vector?: unknown
          sexp: string
          spice_results?: Json | null
          star_count?: number
          summary_embedding?: string | null
          svg_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_struct?: Json | null
          component_count?: number
          created_at?: string
          description?: string | null
          fork_count?: number
          fork_of?: string | null
          fork_root_id?: string | null
          id?: string
          owner_id?: string
          raw_kicad_url?: string | null
          search_vector?: unknown
          sexp?: string
          spice_results?: Json | null
          star_count?: number
          summary_embedding?: string | null
          svg_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "schematics_fork_of_fkey"
            columns: ["fork_of"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schematics_fork_root_id_fkey"
            columns: ["fork_root_id"]
            isOneToOne: false
            referencedRelation: "schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schematics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_spend_today: { Args: { p_user_id: string }; Returns: number }
      match_kb_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
          source_type: string
        }[]
      }
      recompute_karma: { Args: { p_user_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
