"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatCurrency, formatDate, type AppLocale } from "@/lib/i18n/format";
import PaymentReceipts from "@/components/finance/PaymentReceipts";

export interface PortalPayment {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export default function PaymentsTable({
  payments,
  totalAmount,
  totalReceived,
  contractId,
}: {
  payments: PortalPayment[];
  totalAmount: number;
  totalReceived: number;
  contractId: string;
}) {
  const t = useTranslations("portal.payments");
  const tCD = useTranslations("portal.contractDetail");
  const locale = useLocale() as AppLocale;
  const outstanding = Math.max(0, totalAmount - totalReceived);
  const isPaid = totalAmount > 0 && outstanding < 1;

  return (
    <div>
      {payments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {tCD("noPayments")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-portal-bg text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("date")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("amount")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("method")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("reference")}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2.5 align-top pt-4">{formatDate(p.date, locale)}</td>
                  <td className="px-3 py-2.5 align-top pt-4 text-end font-medium tabular-nums">
                    {formatCurrency(p.amount, locale)}
                  </td>
                  <td className="px-3 py-2.5 align-top pt-4">{p.method}</td>
                  <td className="px-3 py-2.5 align-top pt-4">
                    <div className="text-muted-foreground mb-2">
                      {p.reference || t("noReference")}
                    </div>
                    <PaymentReceipts contractId={contractId} paymentId={p.id} isClient={true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <dl className="mt-4 grid gap-3 rounded-lg border bg-portal-bg p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {tCD("totalAmount")}
          </dt>
          <dd className="mt-0.5 text-base font-semibold">{formatCurrency(totalAmount, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {tCD("totalReceived")}
          </dt>
          <dd className="mt-0.5 text-base font-semibold text-emerald-700">
            {formatCurrency(totalReceived, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {tCD("outstanding")}
          </dt>
          <dd
            className={`mt-0.5 text-base font-semibold ${
              isPaid ? "text-emerald-700" : outstanding > 0 ? "text-amber-700" : "text-foreground"
            }`}
          >
            {isPaid ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                {tCD("fullyPaid")}
              </span>
            ) : (
              formatCurrency(outstanding, locale)
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
