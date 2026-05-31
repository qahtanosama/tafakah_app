import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";
import ShippingDocsHeader from "@/components/pdf/ShippingDocsHeader";
import { Letterhead, Footer, s, formatDate, fmt, fmtUSD } from "@/components/pdf/shared";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
}

export default function SalesContractPDF({ data, totals, contractNumber }: Props) {
  const filledItems = data.lineItems.filter((item) => item.product);

  // SC-local compaction overrides — keep everything on ONE A4 page after the
  // ShippingDocsHeader box was added. These layer on top of the SHARED `s`
  // styles via style arrays, so they affect ONLY the Sales Contract and never
  // the CI / PL / Customs / Freight docs (which reuse the same `s` styles).
  const sectionTitle = [s.sectionTitle, { marginTop: 3, marginBottom: 2, paddingTop: 2.5, paddingBottom: 2.5 }];

  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingBottom: 42 }]} wrap>
        <Letterhead />
        <Footer />

        <Text style={s.title}>SALES CONTRACT</Text>

        <View style={s.contractInfoRow}>
          <Text>
            <Text style={s.contractInfoLabel}>Contract No: </Text>
            <Text style={s.contractInfoValueBold}>{contractNumber || "\u2014"}</Text>
          </Text>
          <Text>
            <Text style={s.contractInfoLabel}>Contract Date: </Text>
            <Text style={s.contractInfoValue}>{formatDate(data.identifiers.contractDate)}</Text>
          </Text>
          <Text>
            <Text style={s.contractInfoLabel}>Invoice Date: </Text>
            <Text style={s.contractInfoValue}>{formatDate(data.identifiers.invoiceDate)}</Text>
          </Text>
        </View>

        {/* Legacy seal line only — B/L + container moved to ShippingDocsHeader
            below (single render, frozen-or-live), mirroring CI / PL / Customs CI. */}
        {data.identifiers.sealNumber ? (
          <View style={s.contractInfoRowNoBorder}>
            <Text><Text style={s.contractInfoLabel}>Seal No: </Text><Text style={s.contractInfoValue}>{data.identifiers.sealNumber}</Text></Text>
          </View>
        ) : null}

        <ShippingDocsHeader
          blNumber={data.blNumber ?? data.identifiers.blNumber}
          containers={
            data.containers && data.containers.length > 0
              ? data.containers
              : data.identifiers.containerNumber
              ? [{ number: data.identifiers.containerNumber }]
              : []
          }
        />

        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <Text style={sectionTitle}>SELLER</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>{data.seller.company}</Text>
            <Text style={{ fontSize: 9 }}>{data.seller.address}</Text>
            <Text style={{ fontSize: 9 }}>Tel: {data.seller.tel}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.seller.email}</Text>
          </View>
          <View style={s.halfCol}>
            <Text style={sectionTitle}>BUYER / CONSIGNEE</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>{data.buyer.company || "\u2014"}</Text>
            <Text style={{ fontSize: 9 }}>{data.buyer.address}</Text>
            {data.buyer.additionalNumber ? <Text style={{ fontSize: 9 }}>Add. No: {data.buyer.additionalNumber}</Text> : null}
            <Text style={{ fontSize: 9 }}>{data.buyer.cityPostal}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.buyer.email}</Text>
            {data.buyer.ccEmail ? <Text style={{ fontSize: 9 }}>CC: {data.buyer.ccEmail}</Text> : null}
          </View>
        </View>

        <Text style={sectionTitle}>SHIPPING & DELIVERY</Text>
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <View style={s.row}><Text style={s.labelCol}>Loading Port:</Text><Text style={s.valueCol}>{data.shipping.loadingPort}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Discharge Port:</Text><Text style={s.valueCol}>{data.shipping.dischargePort || "\u2014"}</Text></View>
          </View>
          <View style={s.halfCol}>
            <View style={s.row}><Text style={s.labelCol}>Incoterm:</Text><Text style={s.valueCol}>{data.shipping.incoterm}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Origin:</Text><Text style={s.valueCol}>{data.shipping.origin}</Text></View>
            <View style={s.row}><Text style={s.labelCol}>Delivery From:</Text><Text style={s.valueCol}>{formatDate(data.shipping.deliveryFrom)}</Text></View>
          </View>
        </View>

        <Text style={sectionTitle}>GOODS DESCRIPTION</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, s.colProduct]}>Product</Text>
            <Text style={[s.tableHeaderText, s.colHS]}>HS Code</Text>
            <Text style={[s.tableHeaderText, s.colNW]}>N.W./Ctn</Text>
            <Text style={[s.tableHeaderText, s.colCtns]}>Cartons</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty (MTS)</Text>
            <Text style={[s.tableHeaderText, s.colPriceCtn]}>Price/Ctn</Text>
            <Text style={[s.tableHeaderText, s.colTotal]}>Amount</Text>
          </View>
          {filledItems.map((item, i) => {
            const multiplier = typeof data.terms.numberOfContainers === "number" && data.terms.numberOfContainers > 0 ? data.terms.numberOfContainers : 1;
            const cartons = typeof item.cartons === "number" ? item.cartons * multiplier : 0;
            const itemQtyMTS = item.qtyMTS * multiplier;
            const amount = item.pricePerCarton * cartons;
            return (
              <View style={s.tableRow} key={i}>
                <Text style={[{ fontSize: 9 }, s.colProduct]}>{item.product}</Text>
                <Text style={[{ fontSize: 9 }, s.colHS]}>{item.hsCode}</Text>
                <Text style={[{ fontSize: 9 }, s.colNW]}>{item.nwPerCarton !== "" ? fmt(item.nwPerCarton as number) : ""}</Text>
                <Text style={[{ fontSize: 9 }, s.colCtns]}>{cartons || ""}</Text>
                <Text style={[{ fontSize: 9 }, s.colQty]}>{fmt(itemQtyMTS, 3)}</Text>
                <Text style={[{ fontSize: 9 }, s.colPriceCtn]}>{fmtUSD(item.pricePerCarton)}</Text>
                <Text style={[{ fontSize: 9 }, s.colTotal]}>{fmtUSD(amount)}</Text>
              </View>
            );
          })}
          <View style={s.tableTotalRow}>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colProduct]}>TOTAL</Text>
            <Text style={[{ fontSize: 9 }, s.colHS]}></Text>
            <Text style={[{ fontSize: 9 }, s.colNW]}></Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colCtns]}>{totals.totalCartons}</Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colQty]}>{fmt(totals.totalQtyMTS, 3)}</Text>
            <Text style={[{ fontSize: 9 }, s.colPriceCtn]}></Text>
            <Text style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colTotal]}>{fmtUSD(totals.totalUSD)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 3 }}>
          <Text style={{ fontSize: 8 }}>Total N.W.: {fmt(totals.totalNetWeight)} KG | Total G.W.: {fmt(totals.totalGrossWeight)} KG</Text>
        </View>

        <View wrap={false}>
          <Text style={sectionTitle}>TERMS & CONDITIONS</Text>
          <View style={{ marginTop: 2 }}>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>1. ORIGIN: </Text>{data.shipping.origin}</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>2. BRAND: </Text>{data.terms.brand}</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>3. DELIVERY: </Text>{data.shipping.incoterm} — from {data.shipping.loadingPort} to {data.shipping.dischargePort || "\u2014"}</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>4. PACKING: </Text>{data.terms.numberOfContainers && data.terms.numberOfContainers > 1 ? `${data.terms.numberOfContainers}x ` : ""}{data.terms.containerType}</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>5. DAMAGE ALLOWANCE: </Text>{data.terms.damageAllowance} of invoice value</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>6. PAYMENT: </Text>T/T (Telegraphic Transfer) to seller&apos;s bank account below.</Text></View>
            <View style={s.termItem}><Text><Text style={{ fontFamily: "Times-Bold" }}>7. VALIDITY: </Text>This contract is valid until {formatDate(data.terms.contractValidTo)}.</Text></View>
          </View>
        </View>

        <View wrap={false}>
          <Text style={sectionTitle}>BANK DETAILS</Text>
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

        <View wrap={false}>
          <View style={[s.signatureArea, { marginTop: 12 }]}>
            <SellerSignatureBlock stamp={data.seller.stamp} company={data.seller.company} />
            <View style={s.buyerBlock}>
              <Text style={s.buyerLine}>BUYER</Text>
              <Text style={{ fontSize: 8, marginTop: 2 }}>{data.buyer.company || "\u2014"}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
