import Link from "next/link";
import { ShieldCheck, Users, Activity, Eye, Sparkles, ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

interface Props {
  fullName: string | null;
}

async function loadStats() {
  const admin = createAdminClient();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [team, client, today] = await Promise.all([
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "team").eq("is_active", true),
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "client").eq("is_active", true),
    admin.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);
  return {
    team: team.count ?? 0,
    client: client.count ?? 0,
    today: today.count ?? 0,
  };
}

const QUICK_ACTIONS = [
  { href: "/admin/super", label: "System Dashboard", icon: ShieldCheck },
  { href: "/admin/users", label: "Manage Users", icon: Users },
  { href: "/admin/audit", label: "Audit Log", icon: Activity },
  { href: "/admin/super/impersonate", label: "View as Client", icon: Eye },
];

export default async function SuperAdminHomeBanner({ fullName }: Props) {
  const stats = await loadStats();
  const displayName = fullName?.trim() || "Super Admin";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-purple-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 shadow-sm sm:p-8 dark:border-purple-500/20 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-purple-950/30">
      <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />

      <div className="relative">
        <div className="flex flex-col gap-1">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300">
            <Sparkles className="h-3 w-3" />
            System Administrator
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#1B2A4A] sm:text-3xl dark:text-white">
            Welcome back, <span className="text-purple-700 dark:text-purple-300">{displayName}</span>
          </h2>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          <li className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-mono text-sm font-semibold text-[#1B2A4A] dark:text-white">{stats.team}</span>
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">Team Accounts</span>
          </li>
          <li className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-mono text-sm font-semibold text-[#1B2A4A] dark:text-white">{stats.client}</span>
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">Clients</span>
          </li>
          <li className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-mono text-sm font-semibold text-[#1B2A4A] dark:text-white">{stats.today}</span>
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">Actions Today</span>
          </li>
        </ul>

        <nav className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-lg border border-[#1B2A4A]/30 bg-white/70 px-4 py-2.5 text-sm font-medium text-[#1B2A4A] backdrop-blur-sm transition-all hover:border-[#1B2A4A] hover:bg-[#1B2A4A] hover:text-white hover:shadow-md dark:border-purple-400/40 dark:bg-zinc-900/60 dark:text-purple-200 dark:hover:bg-purple-700 dark:hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-purple-600 transition-colors group-hover:text-purple-300 dark:text-purple-300" />
                {label}
              </span>
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-50 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
