import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (user) {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("role, is_active")
      .eq("user_id", user.id)
      .single();
    if (profile?.is_active) {
      redirect(profile.role === "client" ? "/portal" : "/");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <span className="text-lg font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">TAFAKAH Trade Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>
        <Suspense fallback={<div className="text-center text-sm text-slate-500">Loading&hellip;</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
