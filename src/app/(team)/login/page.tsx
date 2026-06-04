import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // `role` is NAVIGATION ONLY — it sets the heading/branding for the chosen
  // entry point. It does NOT influence auth or the post-login destination; that
  // is always derived from the user's real role in users_profile (see LoginForm).
  const roleParam = sp?.role;
  const role = roleParam === "client" ? "client" : roleParam === "team" ? "team" : null;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (user) {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("role, is_active, preferred_language")
      .eq("user_id", user.id)
      .single();
    if (profile?.is_active) {
      if (profile.role === "client") {
        redirect(profile.preferred_language === "ar" ? "/ar/portal" : "/portal");
      }
      redirect("/");
    }
  }

  const heading = role === "client" ? "Client Portal" : "TAFAKAH Trade Hub";
  const subtitle =
    role === "client"
      ? "Sign in to track your shipments & documents"
      : role === "team"
      ? "Team sign in"
      : "Sign in to continue";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
            <span className="text-lg font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{heading}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Suspense fallback={<div className="text-center text-sm text-slate-500">Loading&hellip;</div>}>
          <LoginForm />
        </Suspense>
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all sign-in options
          </Link>
        </div>
      </div>
    </div>
  );
}
