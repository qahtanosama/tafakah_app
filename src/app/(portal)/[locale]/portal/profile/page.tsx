import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import LanguagePreference from "@/components/portal/LanguagePreference";
import ChangePasswordCard from "@/components/portal/ChangePasswordCard";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portal.profile" });
  const tNav = await getTranslations({ locale, namespace: "portal.nav" });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("full_name, buyer_id, role, is_active, preferred_language")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active || profile.role !== "client") redirect("/login?error=disabled");

  const { data: buyer } = profile.buyer_id
    ? await supabase
        .from("buyers")
        .select("company_name, contact_name, country, city, address, email, phone_number")
        .eq("id", profile.buyer_id)
        .single()
    : { data: null };

  const initialLang: "en" | "ar" =
    profile.preferred_language === "ar" ? "ar" : "en";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
      </header>

      {/* Company info (read-only) */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("company")}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("company")} value={buyer?.company_name ?? "—"} />
          <Field label={t("contact")} value={buyer?.contact_name ?? profile.full_name ?? "—"} />
          <Field label={t("email")} value={buyer?.email ?? user.email ?? "—"} />
          <Field label={t("phone")} value={buyer?.phone_number ?? "—"} />
          <Field label={t("country")} value={buyer?.country ?? "—"} />
          <Field label={t("city")} value={buyer?.city ?? "—"} />
          <div className="sm:col-span-2">
            <Field label={t("address")} value={buyer?.address ?? "—"} />
          </div>
        </dl>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t("readOnlyNote")}
        </p>
      </section>

      {/* Preferences */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("preferences")}</h2>
        <div className="mt-4">
          <LanguagePreference initial={initialLang} />
        </div>
      </section>

      {/* Account */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("account")}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("email")} value={user.email ?? "—"} />
        </dl>
        <div className="mt-4 space-y-3 border-t pt-4">
          <ChangePasswordCard />
          <form action="/logout" method="POST">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/30 bg-white px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
            >
              <LogOut className="h-4 w-4" />
              {tNav("logout")}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium">{value}</dd>
    </div>
  );
}

