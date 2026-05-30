import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SalesContractData } from "@/types/sales-contract";
import type { ContractContainer } from "@/types/contract";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";
import ShippingDocsHeader from "@/components/pdf/ShippingDocsHeader";
import { Letterhead, Footer, s, formatDate, fmtUSD } from "@/components/pdf/shared";
import { numberToWords } from "@/lib/number-to-words";

interface Props {
  data: SalesContractData;
  /** Already suffixed with -FRT by the caller. */
  invoiceNumber: string;
  contractNumber: string;
  freightBase: number;
  freightAdditional: number;
  freightChargeLabel: string;
  freightInvoiceDate: string;
  freightNotes: string;
  loadingPort: string;
  dischargePort: string;
  containers: ContractContainer[];
}

export default function FreightInvoicePDF({
  data,
  invoiceNumber,
  contractNumber,
  freightBase,
  freightAdditional,
  freightChargeLabel,
  freightInvoiceDate,
  freightNotes,
  loadingPort,
  dischargePort,
  containers,
}: Props) {
  const total = (freightBase || 0) + (freightAdditional || 0);
  const products = data.lineItems
    .map((i) => i.product)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => String(p).toUpperCase());
  const containerNumbers = containers.map((c) => c.number).filter((n) => n && n.length > 0);
  const route = `${loadingPort || "—"} → ${dischargePort || "—"}`;

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Letterhead />
        <Footer />

        <Text style={s.title}>FREIGHT INVOICE</Text>
        <Text style={{ fontSize: 9, textAlign: "center", color: "#444", marginTop: -4, marginBottom: 4 }}>
          Sea Freight Charges &mdash; FOB Contract {contractNumber}
        </Text>

        {/* Two-column: Bill To (buyer) | Invoice Info */}
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>BILL TO</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>{data.buyer.company || "—"}</Text>
            <Text style={{ fontSize: 9 }}>{data.buyer.address}</Text>
            {data.buyer.additionalNumber ? <Text style={{ fontSize: 9 }}>Add. No: {data.buyer.additionalNumber}</Text> : null}
            <Text style={{ fontSize: 9 }}>{data.buyer.cityPostal}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.buyer.email}</Text>
          </View>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>INVOICE DETAILS</Text>
            <View style={s.row}><Text style={s.labelCol}>Invoice No:</Text><Text style={[s.valueCol, { fontFamily: "Times-Bold" }]}>{invoiceNumber}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Invoice Date:</Text><Text style={s.valueCol}>{formatDate(freightInvoiceDate)}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Route:</Text><Text style={s.valueCol}>{route}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>S/C No:</Text><Text style={s.valueCol}>{contractNumber}</Text></View>
          </View>
        </View>

        <ShippingDocsHeader
          blNumber={data.blNumber ?? data.identifiers.blNumber}
          containers={containers.length > 0 ? containers : []}
        />

        {/* Charges Table */}
        <Text style={s.sectionTitle}>FREIGHT CHARGES</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, { width: "42%", paddingHorizontal: 3, paddingVertical: 2 }]}>Description</Text>
            <Text style={[s.tableHeaderText, { width: "16%", paddingHorizontal: 3, paddingVertical: 2 }]}>Contract Ref</Text>
            <Text style={[s.tableHeaderText, { width: "24%", paddingHorizontal: 3, paddingVertical: 2 }]}>Route</Text>
            <Text style={[s.tableHeaderText, { width: "18%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" }]}>Amount</Text>
          </View>

          {/* Base sea freight */}
          <View style={s.tableRow}>
            <View style={{ width: "42%", paddingHorizontal: 3, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9 }}>OCEAN FREIGHT (SEA)</Text>
              {products.length > 0 ? <Text style={{ fontSize: 7.5, color: "#444" }}>{products.join(", ")}</Text> : null}
              {containerNumbers.length > 0 ? <Text style={{ fontSize: 7.5, color: "#444" }}>Containers: {containerNumbers.join(", ")}</Text> : null}
            </View>
            <Text style={[{ fontSize: 9 }, { width: "16%", paddingHorizontal: 3, paddingVertical: 2 }]}>{contractNumber}</Text>
            <Text style={[{ fontSize: 9 }, { width: "24%", paddingHorizontal: 3, paddingVertical: 2 }]}>{route}</Text>
            <Text style={[{ fontSize: 9, textAlign: "right" }, { width: "18%", paddingHorizontal: 3, paddingVertical: 2 }]}>{fmtUSD(freightBase || 0)}</Text>
          </View>

          {/* Additional charge (only when present) */}
          {freightAdditional > 0 ? (
            <View style={s.tableRow}>
              <Text style={[{ fontSize: 9 }, { width: "42%", paddingHorizontal: 3, paddingVertical: 2 }]}>{freightChargeLabel || "Additional freight charge"}</Text>
              <Text style={[{ fontSize: 9 }, { width: "16%", paddingHorizontal: 3, paddingVertical: 2 }]}>{contractNumber}</Text>
              <Text style={[{ fontSize: 9 }, { width: "24%", paddingHorizontal: 3, paddingVertical: 2 }]}>{"—"}</Text>
              <Text style={[{ fontSize: 9, textAlign: "right" }, { width: "18%", paddingHorizontal: 3, paddingVertical: 2 }]}>{fmtUSD(freightAdditional)}</Text>
            </View>
          ) : null}

          <View style={s.tableTotalRow}>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, { width: "82%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" }]}>TOTAL DUE:</Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold", textAlign: "right" }, { width: "18%", paddingHorizontal: 3, paddingVertical: 2 }]}>{fmtUSD(total)}</Text>
          </View>
        </View>

        {/* Amount in words (auto-generated from the total) */}
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 9 }}>
            <Text style={{ fontFamily: "Times-Bold" }}>TOTAL SAY USD IS </Text>
            {numberToWords(total)}.
          </Text>
        </View>

        {/* Payment instructions — reuse seller bank block */}
        <View wrap={false}>
          <Text style={s.sectionTitle}>PAYMENT INSTRUCTIONS</Text>
          <Text style={{ fontSize: 8.5, color: "#444", marginBottom: 2 }}>
            Please remit payment quoting reference {invoiceNumber}.
          </Text>
          <View style={s.twoCol}>
            <View style={s.halfCol}>
              <View style={s.row}><Text style={s.labelCol}>SWIFT:</Text><Text style={s.valueCol}>{data.bank.swift}</Text></View>
              <View style={s.row}><Text style={s.labelCol}>Beneficiary:</Text><Text style={s.valueCol}>{data.bank.beneficiary}</Text></View>
              <View style={s.row}><Text style={s.labelCol}>Account No:</Text><Text style={s.valueCol}>{data.bank.account}</Text></View>
            </View>
            <View style={s.halfCol}>
              <View style={s.row}><Text style={s.labelCol}>Bank:</Text><Text style={s.valueCol}>{data.bank.bank}</Text></View>
              <View style={s.row}><Text style={s.labelCol}>Bank Address:</Text><Text style={s.valueCol}>{data.bank.bankAddress}</Text></View>
              <View style={s.row}><Text style={s.labelCol}>Post Code:</Text><Text style={s.valueCol}>{data.bank.postCode}</Text></View>
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={{ marginTop: 8 }} wrap={false}>
          <Text style={s.sectionTitle}>NOTES</Text>
          <Text style={{ fontSize: 8.5 }}>1. This invoice covers ocean freight only and is separate from the goods Commercial Invoice.</Text>
          <Text style={{ fontSize: 8.5 }}>2. Per FOB {loadingPort || "loading port"} terms, sea freight is payable by the buyer.</Text>
          <Text style={{ fontSize: 8.5 }}>
            3. Route {route}{containerNumbers.length > 0 ? ` · Container(s): ${containerNumbers.join(", ")}` : ""}.
          </Text>
          {freightNotes ? <Text style={{ fontSize: 8.5, marginTop: 2 }}>{freightNotes}</Text> : null}
        </View>

        {/* Signature — seller only */}
        <View wrap={false}>
          <View style={{ marginTop: 20 }}>
            <SellerSignatureBlock stamp={data.seller.stamp} company={data.seller.company} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
