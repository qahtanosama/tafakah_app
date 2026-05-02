"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type Role = "super_admin" | "team" | "client";

export interface UserProfile {
  user_id: string;
  role: Role;
  full_name: string | null;
  is_active: boolean;
  buyer_id: string | null;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, role: null, loading: true });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load(user: User | null) {
      if (!user) {
        if (!cancelled) setState({ user: null, profile: null, role: null, loading: false });
        return;
      }
      const { data: profile } = await supabase
        .from("users_profile")
        .select("user_id, role, full_name, is_active, buyer_id")
        .eq("user_id", user.id)
        .single();
      if (cancelled) return;
      setState({
        user,
        profile: (profile as UserProfile | null) ?? null,
        role: (profile?.role as Role | undefined) ?? null,
        loading: false,
      });
    }

    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setState({ user: null, profile: null, role: null, loading: false });
  }, []);

  // Super admin inherits team-level UI capabilities; isTeam returns true for
  // both super_admin and team. Use isSuperAdmin for super-only UI bits.
  const isSuperAdmin = state.role === "super_admin";
  const isTeam = state.role === "team" || state.role === "super_admin";
  const isClient = state.role === "client";

  return { ...state, isSuperAdmin, isTeam, isClient, signOut };
}
