"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";
import { setPreferredLanguage } from "@/app/(portal)/[locale]/portal/profile/actions";

export default function LanguagePreference({ initial }: { initial: "en" | "ar" }) {
  const t = useTranslations("portal.profile");
  const currentLocale = useLocale();
  const [value, setValue] = useState<"en" | "ar">(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(next: "en" | "ar") {
    if (next === value) return;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await setPreferredLanguage(next);
      if (!res.ok) {
        setError(res.error);
        setValue(value);
        return;
      }
      if (next !== currentLocale) {
        router.replace(pathname, { locale: next });
      }
    });
  }

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-medium">{t("language")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <RadioOption
            label="English"
            checked={value === "en"}
            onChange={() => handleChange("en")}
            disabled={pending}
          />
          <RadioOption
            label="العربية"
            checked={value === "ar"}
            onChange={() => handleChange("ar")}
            disabled={pending}
          />
          {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">{t("languageNote")}</p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RadioOption({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        checked ? "border-navy bg-navy text-white" : "border-border bg-white hover:bg-muted"
      } ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}
