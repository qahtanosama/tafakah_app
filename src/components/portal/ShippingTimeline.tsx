"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Truck, Anchor, Package, FileCheck, Factory, MapPin } from "lucide-react";
import { formatDate, type AppLocale } from "@/lib/i18n/format";

export interface ShippingData {
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  vessel: string | null;
  voyage: string | null;
  blNumber: string | null;
  carrier: string | null;
  containerNumbers: string[] | null;
}

interface Step {
  key:
    | "booked"
    | "documents"
    | "factory"
    | "loaded"
    | "departed"
    | "atSea"
    | "arrived"
    | "delivered";
  date: string | null;
  done: boolean;
}

export default function ShippingTimeline({
  shipping,
  stage,
}: {
  shipping: ShippingData | null;
  stage: string;
}) {
  const t = useTranslations("portal.shipping");
  const tStages = useTranslations("portal.shipping.stages");
  const locale = useLocale() as AppLocale;

  const stageOrder = [
    "costed",
    "docs-generated",
    "sent-to-factory",
    "sc-sent-to-buyer",
    "shipped",
    "certs-ready",
    "delivered",
  ];
  const stageIdx = stageOrder.indexOf(stage);

  const steps: Step[] = [
    { key: "booked", date: null, done: stageIdx >= 1 },
    { key: "documents", date: null, done: stageIdx >= 1 },
    { key: "factory", date: null, done: stageIdx >= 2 },
    { key: "loaded", date: shipping?.atd ?? null, done: !!shipping?.atd || stageIdx >= 4 },
    { key: "departed", date: shipping?.atd ?? shipping?.etd ?? null, done: !!shipping?.atd || stageIdx >= 4 },
    { key: "atSea", date: shipping?.etd ?? null, done: stageIdx >= 4 && !shipping?.ata },
    { key: "arrived", date: shipping?.ata ?? shipping?.eta ?? null, done: !!shipping?.ata || stageIdx >= 6 },
    { key: "delivered", date: null, done: stageIdx >= 6 },
  ];

  // Determine which step is "active" — the first incomplete one.
  const activeIdx = steps.findIndex((s) => !s.done);

  const ICONS: Record<Step["key"], React.ReactNode> = {
    booked: <FileCheck className="h-4 w-4" />,
    documents: <FileCheck className="h-4 w-4" />,
    factory: <Factory className="h-4 w-4" />,
    loaded: <Package className="h-4 w-4" />,
    departed: <Anchor className="h-4 w-4" />,
    atSea: <Truck className="h-4 w-4" />,
    arrived: <MapPin className="h-4 w-4" />,
    delivered: <Check className="h-4 w-4" />,
  };

  return (
    <div>
      {/* Header info */}
      {shipping && (shipping.vessel || shipping.voyage || shipping.blNumber || shipping.carrier) ? (
        <dl className="mb-6 grid grid-cols-2 gap-3 rounded-lg border bg-portal-bg p-4 text-sm sm:grid-cols-4">
          <DLItem label={t("vessel")} value={shipping.vessel} />
          <DLItem label={t("voyage")} value={shipping.voyage} />
          <DLItem label={t("blNumber")} value={shipping.blNumber} />
          <DLItem label={t("carrier")} value={shipping.carrier} />
        </dl>
      ) : null}

      {!shipping ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noShipping")}
        </p>
      ) : (
        <>
          {/* Desktop horizontal timeline */}
          <ol className="hidden md:flex md:items-start md:justify-between md:gap-2">
            {steps.map((step, idx) => {
              const isActive = idx === activeIdx;
              const isDone = step.done;
              return (
                <li key={step.key} className="flex flex-1 flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <div
                      className={`h-0.5 flex-1 ${idx === 0 ? "invisible" : isDone ? "bg-navy" : "bg-muted"}`}
                    />
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                        isDone
                          ? "border-navy bg-navy text-white"
                          : isActive
                          ? "border-gold bg-gold text-navy ring-4 ring-gold/20"
                          : "border-muted bg-white text-muted-foreground"
                      }`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : ICONS[step.key]}
                    </div>
                    <div
                      className={`h-0.5 flex-1 ${idx === steps.length - 1 ? "invisible" : isDone && steps[idx + 1]?.done ? "bg-navy" : "bg-muted"}`}
                    />
                  </div>
                  <p
                    className={`mt-2 text-xs font-medium ${
                      isDone ? "text-navy" : isActive ? "text-gold" : "text-muted-foreground"
                    }`}
                  >
                    {tStages(step.key)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {step.date ? formatDate(step.date, locale) : "—"}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Mobile vertical timeline */}
          <ol className="md:hidden">
            {steps.map((step, idx) => {
              const isActive = idx === activeIdx;
              const isDone = step.done;
              const isLast = idx === steps.length - 1;
              return (
                <li key={step.key} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                        isDone
                          ? "border-navy bg-navy text-white"
                          : isActive
                          ? "border-gold bg-gold text-navy ring-4 ring-gold/20"
                          : "border-muted bg-white text-muted-foreground"
                      }`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : ICONS[step.key]}
                    </div>
                    {!isLast && (
                      <div
                        className={`mt-1 h-full w-0.5 flex-1 ${isDone && steps[idx + 1]?.done ? "bg-navy" : "bg-muted"}`}
                      />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p
                      className={`text-sm font-medium ${
                        isDone ? "text-navy" : isActive ? "text-gold" : "text-muted-foreground"
                      }`}
                    >
                      {tStages(step.key)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.date ? formatDate(step.date, locale) : "—"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function DLItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}

