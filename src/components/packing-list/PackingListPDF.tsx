"use client";

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";
import { Letterhead, Footer, s, formatDate, fmt } from "@/components/pdf/shared";
import { intToWords } from "@/lib/number-to-words";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
  invoiceNumber: string;
}

const col = {
  marks: { width: "12%", paddingHorizontal: 3, paddingVertical: 2 },
  desc: { width: "30%", paddingHorizontal: 3, paddingVertical: 2 },
  qty: { width: "18%", paddingHorizontal: 3, paddingVertical: 2 },
  nw: { width: "20%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" as const },
  gw: { width: "20%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" as const },
};

export default function PackingListPDF({ data, totals, contractNumber, invoiceNumber }: Props) {
  const filledItems = data.lineItems.filter((item) => item.product);
  const brand = data.terms.brand;
  const marks = brand.toUpperCase() === "NO MARK" ? "N/M" : brand;

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Letterhead />
        <Footer />

        <Text style={s.title}>PACKING LIST</Text>

        {/* Two-column: TO (left) | Invoice Info (right) */}
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>TO</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>{data.buyer.company || "\u2014"}</Text>
            <Text style={{ fontSize: 9 }}>{data.buyer.address}</Text>
            {data.buyer.additionalNumber ? <Text style={{ fontSize: 9 }}>Add. No: {data.buyer.additionalNumber}</Text> : null}
            <Text style={{ fontSize: 9 }}>{data.buyer.cityPostal}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.buyer.email}</Text>
          </View>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>DETAILS</Text>
            <View style={s.row}><Text style={s.labelCol}>INV NO:</Text><Text style={[s.valueCol, { fontFamily: "Times-Bold" }]}>{invoiceNumber}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>INV DATE:</Text><Text style={s.valueCol}>{formatDate(data.identifiers.invoiceDate)}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Loading Port:</Text><Text style={s.valueCol}>{data.shipping.loadingPort}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>SC NO:</Text><Text style={s.valueCol}>{contractNumber}</Text></View>
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

        {/* Packing Table — NO PRICES */}
        <Text style={s.sectionTitle}>PACKING DETAILS</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, col.marks]}>Marks</Text>
            <Text style={[s.tableHeaderText, col.desc]}>Description</Text>
            <Text style={[s.tableHeaderText, col.qty]}>Qty</Text>
            <Text style={[s.tableHeaderText, col.nw]}>N.W.</Text>
            <Text style={[s.tableHeaderText, col.gw]}>G.W.</Text>
          </View>
          {filledItems.map((item, i) => {
            const cartons = typeof item.cartons === "number" ? item.cartons : 0;
            const nw = typeof item.nwPerCarton === "number" ? item.nwPerCarton : 0;
            const gw = typeof item.gwPerCarton === "number" ? item.gwPerCarton : 0;
            const totalNW = nw * cartons;
            const totalGW = gw * cartons;
            return (
              <View style={s.tableRow} key={i}>
                <Text style={[{ fontSize: 9 }, col.marks]}>{marks}</Text>
                <View style={col.desc}>
                  <Text style={{ fontSize: 9, fontFamily: "Times-Bold" }}>{item.product.toUpperCase()}</Text>
                  <Text style={{ fontSize: 8 }}>SIZE: {nw ? `${fmt(nw)}KG AND UP` : "\u2014"}</Text>
                  <Text style={{ fontSize: 8 }}>H.S.CODE.NO: {item.hsCode}</Text>
                  <Text style={{ fontSize: 8 }}>({cartons.toLocaleString()} CARTONS)</Text>
                </View>
                <View style={col.qty}>
                  <Text style={{ fontSize: 9 }}>{fmt(item.qtyMTS, 3)} MTS</Text>
                  <Text style={{ fontSize: 7.5, color: "#444" }}>({data.terms.containerType})</Text>
                </View>
                <Text style={[{ fontSize: 9 }, col.nw]}>{totalNW.toLocaleString()} KGS</Text>
                <Text style={[{ fontSize: 9 }, col.gw]}>{totalGW.toLocaleString()} KGS</Text>
              </View>
            );
          })}
          <View style={s.tableTotalRow}>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, col.marks]}>TOTAL</Text>
            <Text style={[{ fontSize: 9 }, col.desc]}></Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, col.qty]}>{fmt(totals.totalQtyMTS, 3)} MTS</Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, col.nw]}>{Math.round(totals.totalNetWeight).toLocaleString()} KGS</Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, col.gw]}>{Math.round(totals.totalGrossWeight).toLocaleString()} KGS</Text>
          </View>
        </View>

        {/* Cartons in words */}
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 9, fontFamily: "Times-Bold" }}>
            SAY: TOTAL {intToWords(totals.totalCartons)} CARTONS ONLY.
          </Text>
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
