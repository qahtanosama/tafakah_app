"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import StageBadge from "./StageBadge";
import { formatCurrency, formatDate, type AppLocale } from "@/lib/i18n/format";

export interface ContractCardData {
  id: string;
  contractNo: string;
  invoiceNo: string;
  stage: string;
  totalUSD: number;
  totalReceived: number;
  etd: string | null;
  eta: string | null;
}

export default function ContractCard({ contract }: { contract: ContractCardData }) {
  const t = useTranslations("portal.contractCard");
  const tCD = useTranslations("portal.contractDetail");
  const locale = useLocale() as AppLocale;

  const pct =
    contract.totalUSD > 0
      ? Math.min(100, Math.max(0, (contract.totalReceived / contract.totalUSD) * 100))
      : 0;

  return (
    <Link
      href={`/portal/contract/${contract.id}`}
      className="group block rounded-xl border bg-white p-5 shadow-sm transition-all hover:border-navy/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-navy">{contract.contractNo}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("invoiceNo")}: {contract.invoiceNo}
          </p>
        </div>
        <StageBadge stage={contract.stage} />
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {tCD("totalAmount")}
        </span>
        <span className="text-lg font-bold tracking-tight text-foreground">
          {formatCurrency(contract.totalUSD, locale)}
        </span>
      </div>

      {/* Payment progress */}
      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(contract.totalReceived, locale)}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
        <div>
          <p className="text-muted-foreground">{t("etd")}</p>
          <p className="mt-0.5 font-medium text-foreground">{formatDate(contract.etd, locale)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("eta")}</p>
          <p className="mt-0.5 font-medium text-foreground">{formatDate(contract.eta, locale)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center text-sm font-medium text-navy group-hover:text-gold">
        {t("viewDetails")}
        <ChevronRight className="ms-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </div>
    </Link>
  );
}
