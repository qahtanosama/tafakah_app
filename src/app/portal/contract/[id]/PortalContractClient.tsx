"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, FileText, Package, Ship } from "lucide-react";
import PaymentReceipts from "@/components/finance/PaymentReceipts";

interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  buyer_id: string | null;
  contract_date: string | null;
  line_items: unknown;
  current_stage: string;
}

interface FinanceRow {
  contract_id: string;
  payments_received: unknown;
}

interface ShippingRow {
  contract_id: string;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  carrier: string | null;
  vessel: string | null;
  voyage: string | null;
  bl_number: string | null;
  status: string | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
}

interface Payment {
  id?: string;
  date?: string;
  amount?: number;
  currency?: string;
  method?: string;
  reference?: string;
}

interface LineItem {
  pricePerCarton?: number;
  pricePerMT?: number;
  cartons?: number;
  qtyMTS?: number;
  product?: string;
}

const STAGE_LABELS: Record<string, string> = {
  "costed": "Costed",
  "docs-generated": "Docs generated",
  "sent-to-factory": "Sent to factory",
  "sc-sent-to-buyer": "SC sent",
  "shipped": "Shipped",
  "certs-ready": "Certs ready",
  "delivered": "Delivered",
};

const DOC_LABELS: Record<string, string> = {
  sc: "Sales Contract",
  ci: "Commercial Invoice",
  pl: "Packing List",
  co: "Certificate of Origin",
  health: "Health Certificate",
  phyto: "Phytosanitary",
  bl: "Bill of Lading",
  other: "Other",
};

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function calcRevenue(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return (lineItems as LineItem[]).reduce((sum, li) => {
    const cartons = Number(li.cartons ?? 0);
    const ppc = Number(li.pricePerCarton ?? 0);
    if (cartons > 0 && ppc > 0) return sum + cartons * ppc;
    const mts = Number(li.qtyMTS ?? 0);
    const ppm = Number(li.pricePerMT ?? 0);
    return sum + mts * ppm;
  }, 0);
}

export default function PortalContractClient({
  userId,
  contract,
  finance,
  shipping,
  documents,
}: {
  userId: string;
  contract: ContractRow;
  finance: FinanceRow | null;
  shipping: ShippingRow | null;
  documents: DocumentRow[];
}) {
  const payments: Payment[] = useMemo(() => {
    const raw = finance?.payments_received;
    return Array.isArray(raw) ? (raw as Payment[]) : [];
  }, [finance]);

  const revenue = useMemo(() => calcRevenue(contract.line_items), [contract.line_items]);
  const totalReceived = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );
  const outstanding = Math.max(0, revenue - totalReceived);

  return (
    <div className="min-h-screen bg-slate-50 py-10 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/portal" className="text-zinc-400 hover:text-zinc-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{contract.contract_no}</h1>
            <p className="text-sm text-zinc-500">
              Invoice {contract.invoice_no}
              {contract.contract_date ? ` · ${contract.contract_date}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {STAGE_LABELS[contract.current_stage] ?? contract.current_stage}
          </span>
        </div>

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900">
            <div className="text-xs text-zinc-400">Total amount</div>
            <div className="mt-1 text-lg font-bold text-zinc-700 dark:text-zinc-100">{fmtUSD(revenue)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900">
            <div className="text-xs text-zinc-400">Received</div>
            <div className="mt-1 text-lg font-bold text-emerald-600">{fmtUSD(totalReceived)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900">
            <div className="text-xs text-zinc-400">Outstanding</div>
            <div className={`mt-1 text-lg font-bold ${outstanding > 1 ? "text-amber-600" : "text-emerald-600"}`}>
              {fmtUSD(outstanding)}
            </div>
          </div>
        </div>

        {/* Shipping */}
        {shipping && (
          <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              <Ship className="h-4 w-4" /> Shipping
            </h2>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-zinc-400">ETD:</span> {shipping.etd || "—"}</div>
              <div><span className="text-zinc-400">ETA:</span> {shipping.eta || "—"}</div>
              <div><span className="text-zinc-400">ATD:</span> {shipping.atd || "—"}</div>
              <div><span className="text-zinc-400">ATA:</span> {shipping.ata || "—"}</div>
              <div><span className="text-zinc-400">Carrier:</span> {shipping.carrier || "—"}</div>
              <div><span className="text-zinc-400">Vessel:</span> {shipping.vessel || "—"}</div>
              <div><span className="text-zinc-400">Voyage:</span> {shipping.voyage || "—"}</div>
              <div><span className="text-zinc-400">B/L:</span> {shipping.bl_number || "—"}</div>
            </div>
          </section>
        )}

        {/* Documents */}
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <Package className="h-4 w-4" /> Documents
          </h2>
          {documents.length === 0 ? (
            <div className="text-sm text-zinc-400">No documents shared yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-700 dark:text-zinc-100">
                      {DOC_LABELS[d.doc_type] ?? d.doc_type}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {d.file_name}
                      {d.file_size ? ` · ${fmtBytes(d.file_size)}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Payments */}
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Payments</h2>
          {payments.length === 0 ? (
            <div className="text-sm text-zinc-400">No payments recorded yet.</div>
          ) : (
            <ul className="space-y-3">
              {payments.map((p, i) => (
                <li key={p.id ?? `p-${i}`} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="font-mono font-semibold">{fmtUSD(Number(p.amount) || 0)}</span>
                    <span className="text-zinc-500">{p.date || "—"}</span>
                    {p.method && <span className="text-zinc-500">· {p.method}</span>}
                    {p.reference && <span className="text-zinc-400">ref: {p.reference}</span>}
                  </div>
                  <PaymentReceipts
                    contractId={contract.id}
                    paymentId={p.id}
                    isClient={true}
                    currentUserId={userId}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
