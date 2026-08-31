import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Quote } from "@/types/quote";
import { Letterhead, s, GRAY_BORDER, LIGHT_BG } from "@/components/pdf/shared";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";
import { getDefaultContractData } from "@/lib/sales-contract";
import { CONTAINER_TYPE } from "@/lib/quote/defaults";
import { QUOTE_BRAND, QUOTE_VALID_DAYS, formatEtd, quoteTerms } from "@/lib/quote/quote-text";
import { qty, usd, usd0 } from "@/lib/money";

/**
 * A price offer on the company letterhead — the same Letterhead and Footer the
 * commercial invoice uses, so an offer and the invoice that follows it are
 * visibly the same company.
 *
 * The letterhead carries the legal entity (TAFAKAH Food (Shanghai) Co., Ltd.)
 * while the offer is made under the NAWA FRESH trading brand; that split is
 * deliberate — see lib/quote/quote-text.ts.
 *
 * Deliberately one short page. The whole point of the offer is the two prices
 * and the freight caveat; a long document buries both.
 */

const o = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 2,
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderColor: GRAY_BORDER,
  },
  brand: { fontSize: 13, fontFamily: "Times-Bold" },
  brandMeta: { fontSize: 8.5, color: "#444", textAlign: "right" },
  cargoLine: { fontSize: 10, marginBottom: 2 },
  priceBox: {
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: GRAY_BORDER,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 22,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: GRAY_BORDER,
  },
  priceRowLast: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 24,
    paddingHorizontal: 8,
    backgroundColor: LIGHT_BG,
  },
  priceTerm: { flex: 1, fontSize: 10, fontFamily: "Times-Bold" },
  priceTermPlain: { flex: 1, fontSize: 10 },
  priceUnit: { width: 110, fontSize: 9, color: "#444", textAlign: "right" },
  priceValue: { width: 90, fontSize: 11, fontFamily: "Times-Bold", textAlign: "right" },
  priceValuePlain: { width: 90, fontSize: 10, textAlign: "right" },
  note: {
    marginTop: 12,
    padding: 7,
    borderWidth: 0.5,
    borderColor: GRAY_BORDER,
    backgroundColor: LIGHT_BG,
  },
  noteLabel: { fontSize: 9, fontFamily: "Times-Bold", marginBottom: 2 },
  noteText: { fontSize: 9, lineHeight: 1.4 },
  termsRow: { flexDirection: "row", marginTop: 10, gap: 20 },
  termsCol: { flex: 1 },
  termLabel: { fontSize: 8.5, fontFamily: "Times-Bold", color: "#444" },
  termValue: { fontSize: 9.5, marginBottom: 4 },
  /**
   * Own footer rather than the shared one.
   *
   * The shared Footer pairs a static line with a page-number
   * `<Text render={…}>` inside a `fixed` absolutely-positioned view, and in
   * @react-pdf/renderer 4.5 that combination makes the whole view render
   * nothing — which is why the contract and invoice PDFs also come out with no
   * footer (a pre-existing bug, reported separately). A static-only fixed view
   * renders reliably, and a one-page offer has no use for page numbers.
   */
  footer: {
    position: "absolute",
    bottom: 18,
    left: 42,
    right: 42,
    borderTopWidth: 0.5,
    borderColor: GRAY_BORDER,
    paddingTop: 5,
  },
  footerText: { fontSize: 7, color: "#666" },
});

export interface PriceOfferData {
  offerNo: string;
  /** ISO date (YYYY-MM-DD). Passed in so the PDF renders deterministically. */
  date: string;
  buyerName?: string;
  productName: string;
  containers: number;
  cartons: number;
  gwPerCarton: number;
  loadingPort: string;
  dischargePort: string;
  etd: string;
  packUnit: string;
  quote: Quote;
}

export default function PriceOfferPDF({ data }: { data: PriceOfferData }) {
  const { seller } = getDefaultContractData();
  const { fob: fobTerm, cif: cifTerm } = quoteTerms(data.loadingPort, data.dischargePort);
  const { quote } = data;
  const unit = data.packUnit?.trim() || "carton";
  const units = unit.endsWith("s") ? unit : unit + "s";

  return (
    <Document
      title={`Price Offer ${data.offerNo}`}
      author={QUOTE_BRAND.name}
      subject={`${data.productName} — ${fobTerm} / ${cifTerm}`}
    >
      {/* Letterhead and Footer are declared first, before the flowing content —
          both are `fixed`, and this is the order the contract and invoice PDFs
          use. Putting Footer last renders nothing at all. */}
      <Page size="A4" style={s.page} wrap>
        <Letterhead />
        <View style={o.footer} fixed>
          <Text style={o.footerText}>
            {QUOTE_BRAND.website} | {QUOTE_BRAND.email} | {seller.company}
          </Text>
        </View>

        <Text style={s.title}>PRICE OFFER</Text>

        <View style={o.brandRow}>
          <Text style={o.brand}>{QUOTE_BRAND.name}</Text>
          <View>
            <Text style={o.brandMeta}>Offer No: {data.offerNo}</Text>
            <Text style={o.brandMeta}>Date: {formatOfferDate(data.date)}</Text>
          </View>
        </View>

        {data.buyerName ? (
          <View style={s.row}>
            <Text style={s.labelCol}>To:</Text>
            <Text style={s.valueCol}>{data.buyerName}</Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Goods</Text>
        <Text style={o.cargoLine}>{data.productName}</Text>
        <Text style={o.cargoLine}>
          {data.containers} × {CONTAINER_TYPE} · {qty(data.cartons)} {units} ·{" "}
          {qty(data.gwPerCarton, 1)} KG gross per {unit}
        </Text>
        <Text style={o.cargoLine}>Total quantity: {qty(quote.totals.qtyMTS, 2)} MT net</Text>
        <Text style={o.cargoLine}>ETD: {formatEtd(data.etd)}</Text>

        {/* Prices are quoted per unit, with one ton price: CIF, on its own row.
            Produce is compared per ton, and a buyer working it out himself would
            divide by the gross weight and land on a different number. FOB per
            ton is left off — the per-unit price is the firm one, and a second
            ton figure reads as a competing quote rather than a restatement. */}
        <View style={o.priceBox}>
          {/* A delivered-price market quotes one figure — there is no base
              price, and no carriage shown at cost beneath it. */}
          {quote.fobPerCarton !== null && (
            <>
              <View style={o.priceRow}>
                <Text style={o.priceTerm}>{fobTerm}</Text>
                <Text style={o.priceUnit}>per {unit}</Text>
                <Text style={o.priceValue}>{usd(quote.fobPerCarton)}</Text>
              </View>
              <View style={o.priceRow}>
                <Text style={o.priceTermPlain}>Sea freight (at cost)</Text>
                <Text style={o.priceUnit}>per {unit}</Text>
                <Text style={o.priceValuePlain}>{usd(quote.freightPerCarton)}</Text>
              </View>
            </>
          )}
          <View style={o.priceRow}>
            <Text style={o.priceTerm}>{cifTerm}</Text>
            <Text style={o.priceUnit}>per {unit}</Text>
            <Text style={o.priceValue}>{usd(quote.cifPerCarton)}</Text>
          </View>
          <View style={o.priceRow}>
            <Text style={o.priceTerm}>{cifTerm}</Text>
            <Text style={o.priceUnit}>per MT</Text>
            <Text style={o.priceValue}>{usd0(quote.quotedPerMT)}</Text>
          </View>
          <View style={o.priceRowLast}>
            <Text style={o.priceTerm}>Total {cifTerm}</Text>
            <Text style={o.priceUnit}>{qty(data.cartons)} {units}</Text>
            <Text style={o.priceValue}>{usd0(quote.quotedTotal)}</Text>
          </View>
        </View>

        <View style={o.note}>
          <Text style={o.noteLabel}>Sea freight</Text>
          <Text style={o.noteText}>
            Sea freight is unstable. The {cifTerm} price is based on today&rsquo;s freight rate and will
            be re-confirmed at the time of booking. The {fobTerm} price is firm for {QUOTE_VALID_DAYS}{" "}
            days from the date of this offer.
          </Text>
        </View>

        <View style={o.termsRow}>
          <View style={o.termsCol}>
            <Text style={o.termLabel}>VALIDITY</Text>
            <Text style={o.termValue}>{QUOTE_VALID_DAYS} days from date of offer</Text>
            <Text style={o.termLabel}>CURRENCY</Text>
            <Text style={o.termValue}>USD</Text>
          </View>
          <View style={o.termsCol}>
            <Text style={o.termLabel}>ORIGIN</Text>
            <Text style={o.termValue}>China</Text>
            <Text style={o.termLabel}>CONTACT</Text>
            <Text style={o.termValue}>
              {QUOTE_BRAND.email} · {QUOTE_BRAND.phone}
            </Text>
          </View>
        </View>

        <View style={s.signatureArea}>
          <View />
          <SellerSignatureBlock stamp={seller.stamp} company={seller.company} />
        </View>
      </Page>
    </Document>
  );
}

/** 29 Jul 2026 — unambiguous for both Gulf and Chinese readers. */
function formatOfferDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
