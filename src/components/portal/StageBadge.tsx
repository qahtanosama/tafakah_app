"use client";

import { useTranslations } from "next-intl";

type Stage =
  | "costed"
  | "docs-generated"
  | "sent-to-factory"
  | "sc-sent-to-buyer"
  | "shipped"
  | "certs-ready"
  | "delivered";

const STYLES: Record<Stage, string> = {
  costed: "bg-slate-100 text-slate-700 border-slate-200",
  "docs-generated": "bg-blue-50 text-blue-700 border-blue-200",
  "sent-to-factory": "bg-amber-50 text-amber-700 border-amber-200",
  "sc-sent-to-buyer": "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-cyan-50 text-cyan-700 border-cyan-200",
  "certs-ready": "bg-violet-50 text-violet-700 border-violet-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function StageBadge({ stage }: { stage: string }) {
  const t = useTranslations("portal.contractCard.stages");
  const s = (stage in STYLES ? stage : "docs-generated") as Stage;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[s]}`}
    >
      {t(s)}
    </span>
  );
}
