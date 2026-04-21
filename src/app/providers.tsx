"use client";

import { createContext, useContext, useMemo } from "react";
import { useAuth, type UserProfile } from "@/hooks/useAuth";
import type { User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: "team" | "client" | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const value = useMemo(() => auth, [auth]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
