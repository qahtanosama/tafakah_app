import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Briefcase, DollarSign, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadClientContracts } from "@/lib/portal/contracts";
import { formatCurrency, type AppLocale } from "@/lib/i18n/format";
import StatCard from "@/components/portal/StatCard";
import ContractCard from "@/components/portal/ContractCard";

export default async function PortalDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portal.dashboard" });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("full_name, buyer_id, role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active || profile.role !== "client") {
    redirect("/login?error=disabled");
  }

  const { data: buyer } = profile.buyer_id
    ? await supabase
        .from("buyers")
        .select("company_name, company_name_cn, country")
        .eq("id", profile.buyer_id)
        .single()
    : { data: null };

  const contracts = await loadClientContracts(supabase);

  const activeCount = contracts.filter((c) => c.stage !== "delivered").length;
  const totalValue = contracts.reduce((s, c) => s + c.totalUSD, 0);
  const outstanding = contracts.reduce((s, c) => s + Math.max(0, c.totalUSD - c.totalReceived), 0);

  const fullName = profile.full_name ?? user.email ?? "";
  const loc = locale as AppLocale;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-navy">
          {t("welcome", { name: fullName })}
        </h1>
        {buyer?.company_name && (
          <p className="mt-1 text-base text-muted-foreground">
            {buyer.company_name}
            {buyer.country ? ` · ${buyer.country}` : ""}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("activeContracts")}
          value={activeCount}
          icon={<Briefcase className="h-5 w-5" />}
          accent="navy"
        />
        <StatCard
          label={t("totalValue")}
          value={formatCurrency(totalValue, loc)}
          icon={<DollarSign className="h-5 w-5" />}
          accent="navy"
        />
        <StatCard
          label={t("outstandingBalance")}
          value={formatCurrency(outstanding, loc)}
          icon={<Wallet className="h-5 w-5" />}
          accent={outstanding > 0 ? "gold" : "muted"}
        />
      </section>

      {/* Contracts */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-navy">{t("yourContracts")}</h2>
        {contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noContracts")}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {contracts.map((c) => (
              <ContractCard key={c.id} contract={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
