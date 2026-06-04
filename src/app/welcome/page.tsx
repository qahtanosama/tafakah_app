import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Welcome — TAFAKAH Trade Hub",
  description: "Sign in to the TAFAKAH export trade platform.",
};

/**
 * Public welcome / landing page. Shown to unauthenticated visitors (the
 * middleware rewrites unauthenticated `/` to this route so the root URL is
 * preserved). The Team / Client buttons are NAVIGATION ONLY — they pick which
 * sign-in heading to show; the post-login destination is always derived from
 * the user's real role in `users_profile` (see LoginForm), never from the button.
 *
 * Already-authenticated visitors are bounced to their real app by role.
 */
export default async function WelcomePage() {
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#FAF7F0] to-[#F1E9D8] px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="TAFAKAH"
            width={72}
            height={72}
            priority
            unoptimized
            className="rounded-2xl bg-white p-1.5 shadow-sm"
          />
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-navy">TAFAKAH Trade Hub</h1>
          <p className="mt-2 text-sm text-navy/60">
            Export trade management — choose how you&rsquo;d like to sign in.
          </p>
        </div>

        {/* Two entry choices */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/login?role=team"
            className="group flex flex-col rounded-2xl border border-navy/10 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy/30 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy/5 text-navy">
              <Briefcase className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-navy">Team Login</h2>
            <p className="mt-1 flex-1 text-sm text-navy/55">
              Staff &amp; administrators — documents, contracts, finance &amp; shipping.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy">
              Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="/login?role=client"
            className="group flex flex-col rounded-2xl border border-gold/30 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10 text-gold">
              <Users className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-navy">Client Login</h2>
            <p className="mt-1 flex-1 text-sm text-navy/55">
              Buyers — track shipments, download documents &amp; view payments.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gold">
              Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-navy/40">
          &copy; {new Date().getFullYear()} TAFAKAH Food (Shanghai). Accounts are created by an administrator.
        </p>
      </div>
    </main>
  );
}
