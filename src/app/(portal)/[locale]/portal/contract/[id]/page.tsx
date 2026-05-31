import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveImpersonation } from "@/lib/impersonation";
import { Link } from "@/i18n/navigation";
import StageBadge from "@/components/portal/StageBadge";
import ShippingTimeline, { type ShippingData } from "@/components/portal/ShippingTimeline";
import DocumentRow, { type DocumentRowData } from "@/components/portal/DocumentRow";
import PaymentsTable, { type PortalPayment } from "@/components/portal/PaymentsTable";
import GeneratedDocDownload from "@/components/portal/GeneratedDocDownload";
import MergeDocumentsDialog from "@/components/portal/MergeDocumentsDialog";
import FinalPackageCard from "@/components/portal/FinalPackageCard";
import { formatCurrency, formatDate, formatNumber, type AppLocale } from "@/lib/i18n/format";

interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  contract_date: string | null;
  current_stage: string;
  line_items: unknown;
  terms: { incoterm?: string; brand?: string; containerType?: string } | null;
  totals: { totalUSD?: number; totalCartons?: number; totalQtyMTS?: number } | null;
  bl_number: string | null;
  containers: Array<{ number?: string }> | null;
  master_snapshot: { shipping?: { incoterm?: string } } | null;
  merged_pdf_path: string | null;
  merged_pdf_generated_at: string | null;
  merged_pdf_size_bytes: number | null;
  merged_pdf_doc_count: number | null;
}

const POST_SHIPPED_STAGES = new Set(["shipped", "certs-ready", "delivered"]);

interface ShippingRow extends ShippingData {
  contract_id: string;
  container_numbers: string[] | null;
  bl_number: string | null;
}

interface FinanceRow {
  contract_id: string;
  payments_received: Array<{
    id?: string;
    date?: string;
    amount?: number;
    method?: string;
    reference?: string;
  }> | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  file_name: string;
  uploaded_at: string;
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portal.contractDetail" });
  const tShip = await getTranslations({ locale, namespace: "portal.shipping" });
  const tDocTypes = await getTranslations({ locale, namespace: "portal.documentTypes" });
  const loc = locale as AppLocale;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // For real client logins RLS already scopes by buyer_id. For super-admin
  // impersonation we have to filter explicitly because their is_team()
  // returns true and would otherwise expose every contract.
  const impersonation = await getActiveImpersonation();
  let q = supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, contract_date, current_stage, line_items, terms, totals, bl_number, containers, master_snapshot, merged_pdf_path, merged_pdf_generated_at, merged_pdf_size_bytes, merged_pdf_doc_count")
    .eq("id", id);
  if (impersonation?.targetBuyerId) {
    q = q.eq("buyer_id", impersonation.targetBuyerId);
  }
  const { data: contractRaw } = await q.maybeSingle();

  const contract = contractRaw as ContractRow | null;
  if (!contract) notFound();

  const [{ data: shippingRaw }, { data: financeRaw }, { data: documentsRaw }] = await Promise.all([
    supabase
      .from("contract_shipping")
      .select("contract_id, etd, atd, eta, ata, vessel, voyage, bl_number, carrier, container_numbers")
      .eq("contract_id", id)
      .maybeSingle(),
    supabase
      .from("contract_finance")
      .select("contract_id, payments_received")
      .eq("contract_id", id)
      .maybeSingle(),
    supabase
      .from("contract_documents")
      .select("id, doc_type, file_name, uploaded_at")
      .eq("contract_id", id)
      .eq("is_archived", false)
      .neq("doc_type", "ci-customs")
      .order("uploaded_at", { ascending: false }),
  ]);

  const shipping = shippingRaw as ShippingRow | null;
  const finance = financeRaw as FinanceRow | null;
  const documents = (documentsRaw as DocumentRow[] | null) ?? [];

  // Uploaded certificates the client may add to a merge — PDFs only (pdf-lib
  // can't merge images), ordered to match the team's Stage-6 package.
  const CERT_TYPES = ["co", "health", "phyto", "bl", "other"];
  const mergeableCertDocs = documents
    .filter((d) => CERT_TYPES.includes(d.doc_type) && /\.pdf$/i.test(d.file_name))
    .sort((a, b) => CERT_TYPES.indexOf(a.doc_type) - CERT_TYPES.indexOf(b.doc_type))
    .map((d) => ({ id: d.id, label: `${tDocTypes(d.doc_type as never)} · ${d.file_name}` }));

  const totalAmount = Number(contract.totals?.totalUSD ?? 0);

  const payments: PortalPayment[] = (finance?.payments_received ?? []).map((p, i) => ({
    id: p.id ?? `p-${i}`,
    date: p.date ?? "",
    amount: Number(p.amount ?? 0),
    method: p.method ?? "—",
    reference: p.reference ?? "",
  }));
  const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

  // Pull loading/discharge port from line_items if encoded there, else fall back to
  // contract.terms (older shape varies). Best-effort — empty string if unknown.
  const lineItems = (contract.line_items as Array<Record<string, unknown>>) ?? [];
  const firstLineMeta = (lineItems[0] ?? {}) as { loadingPort?: string; dischargePort?: string; product?: string };
  const loadingPort = firstLineMeta.loadingPort ?? "—";
  const dischargePort = firstLineMeta.dischargePort ?? "—";
  const productName = Array.from(new Set(lineItems.map(item => item.product).filter(Boolean))).join(", ") || "—";

  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  const showShippingDocs = POST_SHIPPED_STAGES.has(contract.current_stage);
  const containerNumbers = (contract.containers ?? [])
    .map((c) => (typeof c?.number === "string" ? c.number : ""))
    .filter((n) => n.length > 0);
  const hasShippingDocs = !!contract.bl_number || containerNumbers.length > 0;

  const shippingForTimeline: ShippingData | null = shipping
    ? {
        etd: shipping.etd,
        atd: shipping.atd,
        eta: shipping.eta,
        ata: shipping.ata,
        vessel: shipping.vessel,
        voyage: shipping.voyage,
        blNumber: shipping.bl_number,
        carrier: shipping.carrier,
        containerNumbers: shipping.container_numbers,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:text-gold"
      >
        <Back className="h-4 w-4" />
        {t("back")}
      </Link>

      {/* Header card */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-navy sm:text-3xl">{contract.contract_no}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{contract.invoice_no}</p>
          </div>
          <StageBadge stage={contract.current_stage} />
        </div>
        <dl className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3">
          <Field
            label={t("totalAmount")}
            value={<span className="text-lg font-bold text-navy">{formatCurrency(totalAmount, loc)}</span>}
          />
          <Field label={tShip("eta")} value={formatDate(shipping?.eta ?? null, loc)} />
          <Field label={t("contractDate")} value={formatDate(contract.contract_date, loc)} />
        </dl>
      </section>

      {/* Contract Information */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("contractInfo")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("loadingPort")} → {t("dischargePort")}
            </p>
            <p className="mt-1 flex items-center gap-2 text-base font-medium">
              <span>{loadingPort}</span>
              <Arrow className="h-4 w-4 text-gold" />
              <span>{dischargePort}</span>
            </p>
          </div>
          <Field label={t("product", { defaultValue: "Product" })} value={productName} />
          <Field label={t("incoterm")} value={contract.terms?.incoterm ?? "—"} />
          <Field label={t("brand")} value={contract.terms?.brand ?? "—"} />
          <Field label={t("containerType")} value={contract.terms?.containerType ?? "—"} />
          <Field
            label={t("quantity")}
            value={
              contract.totals?.totalQtyMTS != null
                ? `${formatNumber(contract.totals.totalQtyMTS, loc, { maximumFractionDigits: 2 })} MT`
                : "—"
            }
          />
          <Field
            label={t("cartons")}
            value={
              contract.totals?.totalCartons != null
                ? formatNumber(contract.totals.totalCartons, loc)
                : "—"
            }
          />
        </div>
        {showShippingDocs && hasShippingDocs && (
          <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2">
            {contract.bl_number ? (
              <Field
                label={t("blNumber")}
                value={<span className="font-mono">{contract.bl_number}</span>}
              />
            ) : null}
            {containerNumbers.length > 0 ? (
              <div className={contract.bl_number ? "" : "sm:col-span-2"}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("containers")}
                </dt>
                <dd className="mt-1 flex flex-wrap gap-2 text-base font-medium text-foreground">
                  {containerNumbers.map((num) => (
                    <span
                      key={num}
                      className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-sm"
                    >
                      {num}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Shipping */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{tShip("trackingTimeline")}</h2>
        <div className="mt-4">
          <ShippingTimeline shipping={shippingForTimeline} stage={contract.current_stage} />
        </div>
      </section>

      {/* Final Document Package — only renders if merged PDF exists */}
      {contract.merged_pdf_path && (
        <FinalPackageCard
          contractId={contract.id}
          contractNo={contract.contract_no}
          generatedAt={contract.merged_pdf_generated_at}
          sizeBytes={contract.merged_pdf_size_bytes}
          docCount={contract.merged_pdf_doc_count}
          locale={loc}
        />
      )}

      {/* Generated Documents */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy">{t("generatedDocuments", { defaultValue: "Official Documents" })}</h2>
          <MergeDocumentsDialog
            contractId={id}
            isFob={(contract.master_snapshot?.shipping?.incoterm ?? "").trim().toUpperCase().startsWith("FOB")}
            certDocs={mergeableCertDocs}
            labels={{
              trigger: t("mergeDocuments", { defaultValue: "Merge Documents" }),
              title: t("mergeDocuments", { defaultValue: "Merge Documents" }),
              description: t("mergeDescription", { defaultValue: "Select the documents to combine into a single PDF." }),
              generatedHeading: t("generatedDocuments", { defaultValue: "Official Documents" }),
              uploadedHeading: t("documents", { defaultValue: "Uploaded Documents" }),
              sc: t("salesContract", { defaultValue: "Sales Contract" }),
              ci: t("commercialInvoice", { defaultValue: "Commercial Invoice" }),
              customs: t("customsInvoice", { defaultValue: "Customs Invoice" }),
              pl: t("packingList", { defaultValue: "Packing List" }),
              freight: t("freightInvoice", { defaultValue: "Freight Invoice" }),
              download: t("downloadMerged", { defaultValue: "Download merged PDF" }),
              cancel: t("cancel", { defaultValue: "Cancel" }),
              selectAtLeastOne: t("selectAtLeastOne", { defaultValue: "Select at least one document." }),
            }}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: "sc", label: t("salesContract", { defaultValue: "Sales Contract" }) },
            { id: "ci", label: t("commercialInvoice", { defaultValue: "Commercial Invoice" }) },
            { id: "customs", label: t("customsInvoice", { defaultValue: "Customs Invoice" }) },
            { id: "pl", label: t("packingList", { defaultValue: "Packing List" }) },
            // Freight Invoice — visible to the client, FOB contracts only.
            ...((contract.master_snapshot?.shipping?.incoterm ?? "").trim().toUpperCase().startsWith("FOB")
              ? [{ id: "freight", label: t("freightInvoice", { defaultValue: "Freight Invoice" }) }]
              : []),
          ].map((doc) => (
            <GeneratedDocDownload
              key={doc.id}
              contractId={id}
              docType={doc.id as "sc" | "ci" | "customs" | "pl" | "freight"}
              label={doc.label}
              downloadLabel={t("downloadDoc")}
            />
          ))}
        </div>
      </section>

      {/* Uploaded Documents */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("documents")}</h2>
        <div className="mt-4 space-y-2">
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("noDocs")}
            </p>
          ) : (
            documents.map((d) => <DocumentRow key={d.id} doc={d as DocumentRowData} />)
          )}
        </div>
      </section>

      {/* Payments */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{t("payments")}</h2>
        <div className="mt-4">
          <PaymentsTable
            payments={payments}
            totalAmount={totalAmount}
            totalReceived={totalReceived}
            contractId={id}
          />
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
    </div>
  );
}
