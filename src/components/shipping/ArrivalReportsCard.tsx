"use client";

import { PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArrivalReports } from "@/lib/data/arrival-reports";

const CONDITION_LABEL: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};
const TAG_LABEL: Record<string, string> = {
  rot: "Rot",
  mould: "Mould",
  sprouting: "Sprouting",
  "over-ripe": "Over-ripe",
};

function conditionClass(condition: string): string {
  const base = "rounded-full px-2 py-0.5 text-xs font-semibold ";
  if (condition === "good") return base + "bg-green-100 text-green-800";
  if (condition === "fair") return base + "bg-yellow-100 text-yellow-800";
  return base + "bg-red-100 text-red-800";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("en-GB");
}

/**
 * Read-only team view of client-submitted arrival reports for a contract.
 * The team cannot edit these — they are the client's after-sales feedback.
 */
export default function ArrivalReportsCard({ contractId }: { contractId: string | null }) {
  const { data: reports, isLoading } = useArrivalReports(contractId ?? undefined);

  // Don't render the card at all until we know there's something to show.
  if (isLoading || !reports || reports.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-4 w-4 text-indigo-500" />
          Arrival Reports
          <span className="text-xs font-normal text-muted-foreground">
            ({reports.length}) — submitted by the client
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reports.map((r) => (
          <article key={r.id} className="rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {r.containerNumber && (
                <span className="rounded-md border bg-white px-2 py-0.5 font-mono text-sm dark:bg-zinc-900">
                  {r.containerNumber}
                </span>
              )}
              {r.condition && (
                <span className={conditionClass(r.condition)}>
                  {CONDITION_LABEL[r.condition] ?? r.condition}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                Arrived {fmtDate(r.arrivalDate)}
              </span>
              <span className="ms-auto text-xs text-muted-foreground">
                Reported {fmtDate(r.createdAt)}
              </span>
            </div>

            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              {(r.damagedBoxes != null || r.totalBoxes != null) && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Damaged / Total boxes
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {r.damagedBoxes ?? "—"} / {r.totalBoxes ?? "—"}
                  </dd>
                </div>
              )}
              {r.issueTags.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Issues</dt>
                  <dd className="mt-0.5 flex flex-wrap gap-1.5">
                    {r.issueTags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >
                        {TAG_LABEL[t] ?? t}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            {r.comments && (
              <p className="mt-3 whitespace-pre-wrap text-sm">{r.comments}</p>
            )}

            {r.photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.photos.map((p) => (
                  <a
                    key={p.path}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-20 w-20 overflow-hidden rounded-md border bg-white dark:bg-zinc-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
