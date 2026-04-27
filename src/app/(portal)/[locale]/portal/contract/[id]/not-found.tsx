import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";

export default async function ContractNotFound() {
  const t = await getTranslations("portal.contractDetail");
  return (
    <div className="rounded-xl border bg-white p-10 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-navy">{t("notFound")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("notFoundHint")}</p>
      <Link
        href="/portal"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t("back")}
      </Link>
    </div>
  );
}
