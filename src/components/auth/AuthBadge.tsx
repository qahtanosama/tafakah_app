"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LogOut, Loader2, ChevronDown, ShieldCheck, Activity, Users, EyeOff,
  Settings, UserCircle2, Languages, ChevronRight,
} from "lucide-react";
import { useAuthContext } from "@/app/(team)/providers";

type LucideIcon = React.ComponentType<{ className?: string }>;

interface MenuItem {
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  external?: boolean;
}

const ROLE_PILL_CLASS: Record<string, string> = {
  super_admin: "bg-purple-50 text-purple-700 border-purple-200",
  team: "bg-indigo-50 text-indigo-700 border-indigo-200",
  client: "bg-amber-50 text-amber-700 border-amber-200",
};

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name?.trim() || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const p = parts[0];
    return (p.length >= 2 ? p.slice(0, 2) : p).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function flipLocale(pathname: string | null): { otherLocale: "en" | "ar"; otherLabel: string; href: string } {
  if (!pathname) return { otherLocale: "ar", otherLabel: "العربية", href: "/ar/portal" };
  if (pathname.startsWith("/ar")) {
    const rest = pathname.slice(3) || "/";
    return { otherLocale: "en", otherLabel: "English", href: rest === "/" ? "/portal" : rest };
  }
  if (pathname.startsWith("/en")) {
    const rest = pathname.slice(3) || "/";
    return { otherLocale: "ar", otherLabel: "العربية", href: `/ar${rest === "/" ? "/portal" : rest}` };
  }
  if (pathname.startsWith("/portal")) {
    return { otherLocale: "ar", otherLabel: "العربية", href: `/ar${pathname}` };
  }
  return { otherLocale: "ar", otherLabel: "العربية", href: "/ar/portal" };
}

export default function AuthBadge() {
  const { user, profile, role, loading, signOut } = useAuthContext();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading || !user || !profile) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = "/login";
    } finally {
      setSigningOut(false);
    }
  };

  const fullName = profile.full_name?.trim() || user.email || "User";
  const initials = initialsOf(profile.full_name, user.email);
  const roleClass = ROLE_PILL_CLASS[role ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const isSuper = role === "super_admin";
  const isClient = role === "client";

  const adminItems: MenuItem[] = isSuper
    ? [
        { href: "/admin/super", label: "System Dashboard", icon: ShieldCheck },
        { href: "/admin/users", label: "Manage Users", icon: Users },
        { href: "/admin/audit", label: "Audit Log", icon: Activity },
        { href: "/admin/super/impersonate", label: "View as Client", icon: EyeOff },
      ]
    : [];

  const teamItems: MenuItem[] = !isClient
    ? [{ href: "/settings", label: "Settings", icon: Settings }]
    : [];

  const flip = flipLocale(pathname);
  const clientItems: MenuItem[] = isClient
    ? [
        { href: "/portal/profile", label: "My Profile", icon: UserCircle2 },
        { href: flip.href, label: flip.otherLabel, icon: Languages },
      ]
    : [];

  const sections: { items: MenuItem[]; key: string }[] = [];
  if (adminItems.length) sections.push({ key: "admin", items: adminItems });
  if (teamItems.length) sections.push({ key: "team", items: teamItems });
  if (clientItems.length) sections.push({ key: "client", items: clientItems });

  return (
    <div ref={containerRef} className="fixed right-3 top-3 z-40 sm:right-4 sm:top-4">
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border bg-white/90 py-1 pl-1 pr-2 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white sm:pr-3 dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-wide text-white ${
              isSuper ? "bg-purple-600" : isClient ? "bg-amber-600" : "bg-indigo-600"
            }`}
            aria-hidden="true"
          >
            {initials}
          </span>
          <span
            className={`hidden rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex ${roleClass}`}
          >
            {role}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border bg-white text-sm shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="border-b bg-slate-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
              <p className="truncate font-semibold">{fullName}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
              <span className={`mt-2 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${roleClass}`}>
                {role}
              </span>
            </div>

            {sections.map((section) => (
              <div key={section.key} className="border-b py-1 dark:border-zinc-800">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return item.href ? (
                    <a
                      key={item.label}
                      href={item.href}
                      role="menuitem"
                      className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800"
                      onClick={() => setOpen(false)}
                    >
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                    </a>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => { item.onClick?.(); setOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800"
                    >
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span className="flex-1 text-left">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
