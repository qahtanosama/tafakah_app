/**
 * Minimal Supabase database types — only the shape we need until `npm run types:supabase`
 * generates the full file. Replace this with the generated output once you run the CLI.
 */
export type Database = {
  public: {
    Tables: {
      users_profile: {
        Row: {
          user_id: string;
          role: "team" | "client";
          full_name: string | null;
          buyer_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role: "team" | "client";
          full_name?: string | null;
          buyer_id?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["users_profile"]["Insert"]>;
      };
      buyers: {
        Row: {
          id: string;
          company_name: string;
          email: string | null;
          portal_enabled: boolean;
          [key: string]: unknown;
        };
        Insert: { id?: string; company_name: string; email?: string | null; portal_enabled?: boolean; [key: string]: unknown };
        Update: Partial<Database["public"]["Tables"]["buyers"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_team: { Args: Record<string, never>; Returns: boolean };
      client_buyer_id: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: Record<string, never>;
  };
};
