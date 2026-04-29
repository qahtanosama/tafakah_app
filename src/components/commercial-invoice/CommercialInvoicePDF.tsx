import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";
import { Letterhead, Footer, s, formatDate, fmt, fmtUSD } from "@/components/pdf/shared";
import { numberToWords } from "@/lib/number-to-words";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
  invoiceNumber: string;
  priceFactor?: number;
}

export default function CommercialInvoicePDF({
  data,
  totals,
  contractNumber,
  invoiceNumber,
  priceFactor = 1,
}: Props) {
  const isCustoms = priceFactor !== 1;
  const title = isCustoms ? "COMMERCIAL INVOICE (CUSTOMS)" : "COMMERCIAL INVOICE";
  const filledItems = data.lineItems.filter((item) => item.product);
  const factoredTotal = totals.totalUSD * priceFactor;
  const suffix = isCustoms ? " (CUSTOMS VALUE)" : "";

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Letterhead />
        <Footer />

        <Text style={s.title}>{title}</Text>

        {/* Two-column: Consignee (left) | Invoice Info (right) */}
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>CONSIGNEE</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>{data.buyer.company || "\u2014"}</Text>
            <Text style={{ fontSize: 9 }}>{data.buyer.address}</Text>
            {data.buyer.additionalNumber ? <Text style={{ fontSize: 9 }}>Add. No: {data.buyer.additionalNumber}</Text> : null}
            <Text style={{ fontSize: 9 }}>{data.buyer.cityPostal}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.buyer.email}</Text>
          </View>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>INVOICE DETAILS</Text>
            <View style={s.row}><Text style={s.labelCol}>Invoice No:</Text><Text style={[s.valueCol, { fontFamily: "Times-Bold" }]}>{invoiceNumber}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Invoice Date:</Text><Text style={s.valueCol}>{formatDate(data.identifiers.invoiceDate)}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Loading Port:</Text><Text style={s.valueCol}>{data.shipping.loadingPort}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>S/C No:</Text><Text style={s.valueCol}>{contractNumber}</Text></View>
          </View>
        </View>

        {/* Optional IDs */}
        {(data.identifiers.sealNumber || data.identifiers.containerNumber || data.identifiers.blNumber) && (
          <View style={[s.contractInfoRowNoBorder, { marginTop: 4 }]}>
            {data.identifiers.sealNumber ? (
              <Text><Text style={s.contractInfoLabel}>Seal No: </Text><Text style={s.contractInfoValue}>{data.identifiers.sealNumber}</Text></Text>
            ) : null}
            {data.identifiers.containerNumber ? (
              <Text><Text style={s.contractInfoLabel}>Container No: </Text><Text style={s.contractInfoValue}>{data.identifiers.containerNumber}</Text></Text>
            ) : null}
            {data.identifiers.blNumber ? (
              <Text><Text style={s.contractInfoLabel}>B/L No: </Text><Text style={s.contractInfoValue}>{data.identifiers.blNumber}</Text></Text>
            ) : null}
          </View>
        )}

        {/* Goods Table */}
        <Text style={s.sectionTitle}>GOODS / PRICING</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, { width: "20%", paddingHorizontal: 3, paddingVertical: 2 }]}>Description</Text>
            <Text style={[s.tableHeaderText, { width: "10%", paddingHorizontal: 3, paddingVertical: 2 }]}>Size</Text>
            <Text style={[s.tableHeaderText, { width: "12%", paddingHorizontal: 3, paddingVertical: 2 }]}>HS Code</Text>
            <Text style={[s.tableHeaderText, { width: "18%", paddingHorizontal: 3, paddingVertical: 2 }]}>Qty</Text>
            <Text style={[s.tableHeaderText, { width: "20%", paddingHorizontal: 3, paddingVertical: 2 }]}>Unit Price</Text>
            <Text style={[s.tableHeaderText, { width: "20%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" }]}>Amount</Text>
          </View>
          {filledItems.map((item, i) => {
            const multiplier = typeof data.terms.numberOfContainers === "number" && data.terms.numberOfContainers > 0 ? data.terms.numberOfContainers : 1;
            const containerText = multiplier > 1 ? `${multiplier}x ${data.terms.containerType}` : data.terms.containerType;
            const cartons = typeof item.cartons === "number" ? item.cartons * multiplier : 0;
            const amount = item.pricePerCarton * cartons * priceFactor;
            const pricePerMT = typeof item.pricePerMT === "number" ? item.pricePerMT * priceFactor : 0;
            const nw = typeof item.nwPerCarton === "number" ? item.nwPerCarton : 0;
            const itemQtyMTS = item.qtyMTS * multiplier;
            return (
              <View style={s.tableRow} key={i}>
                <Text style={[{ fontSize: 9 }, { width: "20%", paddingHorizontal: 3, paddingVertical: 2 }]}>{item.product.toUpperCase()}</Text>
                <Text style={[{ fontSize: 9 }, { width: "10%", paddingHorizontal: 3, paddingVertical: 2 }]}>{nw ? `${fmt(nw)}KGS` : ""}</Text>
                <Text style={[{ fontSize: 9 }, { width: "12%", paddingHorizontal: 3, paddingVertical: 2 }]}>{item.hsCode}</Text>
                <View style={{ width: "18%", paddingHorizontal: 3, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9 }}>{fmt(itemQtyMTS, 3)} MTS</Text>
                  <Text style={{ fontSize: 7.5, color: "#444" }}>({containerText})</Text>
                </View>
                <View style={{ width: "20%", paddingHorizontal: 3, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9 }}>{data.shipping.incoterm}</Text>
                  <Text style={{ fontSize: 9 }}>{fmtUSD(pricePerMT)}/MT</Text>
                </View>
                <Text style={[{ fontSize: 9, textAlign: "right" }, { width: "20%", paddingHorizontal: 3, paddingVertical: 2 }]}>{fmtUSD(amount)}</Text>
              </View>
            );
          })}
          <View style={s.tableTotalRow}>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, { width: "80%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" }]}>TOTAL:</Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold", textAlign: "right" }, { width: "20%", paddingHorizontal: 3, paddingVertical: 2 }]}>{fmtUSD(factoredTotal)}</Text>
          </View>
        </View>

        {/* Origin certification */}
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 9, fontFamily: "Times-Bold" }}>
            WE HEREBY CERTIFY THAT THE MERCHANDISE IS OF CHINESE ORIGIN.
          </Text>
        </View>

        {/* Amount in words */}
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 9 }}>
            <Text style={{ fontFamily: "Times-Bold" }}>TOTAL SAY USD IS </Text>
            {numberToWords(factoredTotal)}.{suffix}
          </Text>
        </View>

        {/* Bank details */}
        <View wrap={false}>
          <Text style={s.sectionTitle}>BANK DETAILS</Text>
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

        {/* Signature — seller only on CI */}
        <View wrap={false}>
          <View style={{ marginTop: 20 }}>
            <SellerSignatureBlock stamp={data.seller.stamp} company={data.seller.company} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
