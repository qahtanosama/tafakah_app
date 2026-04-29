"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X, LogOut, ChevronDown, User } from "lucide-react";
import LocaleSwitcher from "./LocaleSwitcher";

const NAV = [
  { href: "/portal", key: "dashboard" as const },
  { href: "/portal/profile", key: "profile" as const },
];

export default function PortalHeader({ fullName, email }: { fullName: string; email: string }) {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";

  function isActive(href: string) {
    if (href === "/portal") return pathname === "/portal";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-navy-dark bg-navy text-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Logo */}
        <Link href="/portal" className="flex items-center gap-2">
          <Image src="/logo.png" alt="TAFAKAH" width={36} height={36} className="rounded-md bg-white p-0.5" priority unoptimized />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">
            TAFAKAH
            <span className="ms-1 text-gold">Portal</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-white/10 text-white"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <LocaleSwitcher />
          </div>

          {/* User menu (desktop) */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setUserOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 ps-1 pe-2 text-sm transition-colors hover:bg-white/10"
              aria-haspopup="menu"
              aria-expanded={userOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-navy">
                {initials}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {userOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
                <div className="absolute end-0 z-20 mt-2 w-56 rounded-lg border bg-white text-foreground shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="truncate text-sm font-medium">{fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{email}</p>
                  </div>
                  <Link
                    href="/portal/profile"
                    onClick={() => setUserOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <User className="h-4 w-4" /> {t("profile")}
                  </Link>
                  <form action="/logout" method="POST">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/5"
                    >
                      <LogOut className="h-4 w-4" /> {t("logout")}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-navy md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-md px-3 py-2 text-base font-medium ${
                  isActive(item.href)
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
            <div className="pt-3">
              <LocaleSwitcher />
            </div>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="px-3 text-sm font-medium">{fullName}</p>
              <p className="px-3 pb-2 text-xs text-white/60">{email}</p>
              <form action="/logout" method="POST">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" /> {t("logout")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
