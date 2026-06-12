"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileX, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContract } from "@/lib/data/contracts";
import { useShipping } from "@/lib/data/shipping";
import { buildContractDocumentData } from "@/lib/contracts/document-data";
import { isFobIncoterm, freightBilledTotal } from "@/lib/shipping";
import FreightInvoicePDFDownload from "./FreightInvoicePDFDownload";

function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-24 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 mt-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 shadow-sm">{icon}</div>
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium">{body}</p>
      </div>
      {action}
    </div>
  );
}

export default function FreightInvoiceForm() {
  const id = useSearchParams().get("id");
  const { data: row, isLoading } = useContract(id ?? undefined);
  const { data: shipping } = useShipping(row?.id);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading document data...</div>;
  }

  const snapshot = row?.master_snapshot ?? null;
  if (!row || !snapshot) {
    return <EmptyState icon={<FileX className="h-8 w-8" />} title="Contract not found" body="This Freight Invoice link is missing a valid contract id." />;
  }

  if (!isFobIncoterm(snapshot.shipping?.incoterm)) {
    return (
      <EmptyState
        icon={<FileX className="h-8 w-8" />}
        title="Not an FOB contract"
        body={`Freight Invoices apply only to FOB contracts. This contract's incoterm is "${snapshot.shipping?.incoterm || "—"}".`}
        action={<Link href="/contract-log"><Button variant="outline">Back to Contract Log</Button></Link>}
      />
    );
  }

  const freightBase = shipping?.freight_base ?? null;
  const freightAdditional = shipping?.freight_additional ?? null;
  const hasFreight = freightBase != null || freightAdditional != null;

  if (!hasFreight) {
    return (
      <EmptyState
        icon={<Ship className="h-8 w-8" />}
        title="No freight entered yet"
        body="Enter the sea-freight amount on the Shipping Tracker for this contract, then generate the Freight Invoice."
        action={
          <Link href={`/shipping/${encodeURIComponent(row.contract_no)}`}>
            <Button className="gap-2"><Ship className="h-4 w-4" /> Go to Shipping Tracker</Button>
          </Link>
        }
      />
    );
  }

  const loadingPort = shipping?.port_of_loading || snapshot.shipping?.loadingPort || "";
  const dischargePort = shipping?.port_of_discharge || snapshot.shipping?.dischargePort || "";
  const containers = row.containers ?? [];
  const invoiceNumber = `${row.invoice_no}-FRT`;

  // Shared builder — the SAME data the portal route feeds the Freight PDF
  // (folds B/L + containers over the snapshot so the header renders them).
  // Non-null here: the `!row || !snapshot` guard above has already returned.
  const data = buildContractDocumentData(row)!.data;
  const total = freightBilledTotal(freightBase, freightAdditional);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Previewing <span className="font-bold">Freight Invoice</span> for{" "}
          <span className="font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100">{invoiceNumber}</span>
          {" "}— sea freight on FOB contract {row.contract_no}. Total due: <span className="font-bold">${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-12 mt-12">
        <FreightInvoicePDFDownload
          data={data}
          invoiceNumber={invoiceNumber}
          contractNumber={row.contract_no}
          freightBase={freightBase ?? 0}
          freightAdditional={freightAdditional ?? 0}
          freightChargeLabel={shipping?.freight_charge_label ?? ""}
          freightInvoiceDate={shipping?.freight_invoice_date ?? ""}
          freightNotes={shipping?.freight_notes ?? ""}
          loadingPort={loadingPort}
          dischargePort={dischargePort}
          containers={containers}
        />
        <Link href={`/shipping/${encodeURIComponent(row.contract_no)}`}>
          <Button variant="outline" className="h-12 px-8 font-bold border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 shadow-sm">
            Edit Freight Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
