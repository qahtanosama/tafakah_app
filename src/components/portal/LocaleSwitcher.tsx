"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: "en" | "ar") {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 p-0.5 text-xs text-white">
      <Globe className="ms-1 h-3.5 w-3.5 opacity-70" />
      <button
        onClick={() => switchTo("en")}
        disabled={isPending}
        className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
          locale === "en" ? "bg-gold text-navy" : "hover:bg-white/10"
        }`}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        onClick={() => switchTo("ar")}
        disabled={isPending}
        className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
          locale === "ar" ? "bg-gold text-navy" : "hover:bg-white/10"
        }`}
        aria-pressed={locale === "ar"}
      >
        العربية
      </button>
    </div>
  );
}
