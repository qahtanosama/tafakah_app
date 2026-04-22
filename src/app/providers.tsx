"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth, type UserProfile } from "@/hooks/useAuth";
import type { User } from "@supabase/supabase-js";
import { RetryQueueProvider } from "@/components/retry-queue/RetryQueueProvider";

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

  // Create QueryClient once (using useState ensures it's stable across renders).
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  // Listen for retry-queue toast events so the user sees "Synced N items".
  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<{ type?: string; msg?: string }>).detail;
      if (detail?.msg) {
        // Basic built-in — individual pages can override with their own toast systems.
        console.log(`[sync] ${detail.msg}`);
      }
    }
    window.addEventListener("retry-queue-toast", onToast);
    return () => window.removeEventListener("retry-queue-toast", onToast);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        <RetryQueueProvider>
          {children}
        </RetryQueueProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
