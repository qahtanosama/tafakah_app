"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import SellerSignatureBlock from "@/components/pdf/SellerSignatureBlock";

/* ── Chinese font for 泰福凯 line ─────────────────────────── */
Font.register({
  family: "NotoSansSC",
  src: "/fonts/NotoSansSC-Regular.ttf",
});

/* ── Colours ───────────────────────────────────────────────── */
const GRAY_BORDER = "#CCCCCC";
const LIGHT_BG = "#F2F2F2";

/* ── Styles ────────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    paddingTop: 15,
    paddingBottom: 50,
    paddingHorizontal: 42,
    lineHeight: 1.35,
  },

  /* Letterhead */
  letterhead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingBottom: 6,
  },
  letterheadLeft: { width: "35%" },
  letterheadCenter: {
    width: "30%",
    alignItems: "center",
    justifyContent: "center",
  },
  letterheadRight: {
    width: "35%",
    alignItems: "flex-end",
  },
  letterheadText: { fontSize: 9, color: "#000000", marginTop: 1 },
  letterheadTextBold: {
    fontSize: 9,
    fontFamily: "Times-Bold",
    color: "#000000",
  },
  letterheadChinese: {
    fontSize: 8,
    fontFamily: "NotoSansSC",
    color: "#000000",
    marginTop: 2,
  },
  letterheadDivider: {
    borderBottomWidth: 0.5,
    borderColor: GRAY_BORDER,
    marginBottom: 4,
  },

  /* Title */
  title: {
    fontSize: 18,
    fontFamily: "Times-Bold",
    textAlign: "center",
    color: "#000000",
    marginTop: 4,
    marginBottom: 6,
  },

  /* Contract info – evenly spaced row */
  contractInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderColor: GRAY_BORDER,
  },
  contractInfoRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  contractInfoLabel: {
    fontFamily: "Times-Bold",
    fontSize: 10,
    marginRight: 4,
  },
  contractInfoValue: {
    fontSize: 10,
  },
  contractInfoValueBold: {
    fontSize: 10,
    fontFamily: "Times-Bold",
  },

  /* Generic key-value row */
  row: { flexDirection: "row", marginBottom: 1.5 },
  labelCol: { width: 85, fontFamily: "Times-Bold", fontSize: 9 },
  valueCol: { flex: 1, fontSize: 9 },

  /* Section headers */
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Times-Bold",
    color: "#000000",
    backgroundColor: LIGHT_BG,
    padding: 4,
    paddingHorizontal: 6,
    marginTop: 6,
    marginBottom: 4,
  },

  /* Two columns */
  twoCol: { flexDirection: "row", gap: 16 },
  halfCol: { flex: 1 },

  /* Goods table */
  table: { marginTop: 4, borderWidth: 0.5, borderColor: GRAY_BORDER },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: LIGHT_BG,
    minHeight: 18,
    alignItems: "center",
  },
  tableHeaderText: {
    color: "#000000",
    fontFamily: "Times-Bold",
    fontSize: 7.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: GRAY_BORDER,
    minHeight: 16,
    alignItems: "center",
  },
  tableTotalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: GRAY_BORDER,
    fontFamily: "Times-Bold",
    minHeight: 18,
    alignItems: "center",
    backgroundColor: LIGHT_BG,
  },
  colProduct: { width: "17%", paddingHorizontal: 3, paddingVertical: 2 },
  colHS: { width: "10%", paddingHorizontal: 3, paddingVertical: 2 },
  colNW: {
    width: "10%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colGW: {
    width: "10%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colCtns: {
    width: "10%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colQty: {
    width: "11%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colPrice: {
    width: "12%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colPriceCtn: {
    width: "10%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },
  colTotal: {
    width: "10%",
    paddingHorizontal: 3,
    paddingVertical: 2,
    textAlign: "right",
  },

  /* Terms */
  termItem: { marginBottom: 3, fontSize: 9 },

  /* Signatures */
  signatureArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  buyerBlock: {
    width: "40%",
    height: 75,
    textAlign: "center",
  },
  buyerLine: {
    borderTopWidth: 1,
    borderColor: "#000",
    marginTop: 45,
    paddingTop: 4,
    fontFamily: "Times-Bold",
    fontSize: 9,
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 18,
    left: 42,
    right: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderColor: GRAY_BORDER,
    paddingTop: 5,
  },
  footerText: { fontSize: 7, color: "#666" },
});

/* ── Helpers ───────────────────────────────────────────────── */

function formatDate(d: string): string {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

function fmtUSD(n: number) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/* ── Sub-components ────────────────────────────────────────── */

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
}

function Letterhead() {
  return (
    <View fixed>
      <View style={s.letterhead}>
        {/* LEFT 35 % — company names */}
        <View style={s.letterheadLeft}>
          <Text style={s.letterheadTextBold}>
            TAFAKAH Food (Shanghai) Co., Ltd.
          </Text>
          <Text style={s.letterheadChinese}>
            {"\u6CF0\u798F\u51EF\u98DF\u54C1\u8D38\u6613\uFF08\u4E0A\u6D77\uFF09\u6709\u9650\u516C\u53F8"}
          </Text>
        </View>

        {/* CENTER 30 % — logo */}
        <View style={s.letterheadCenter}>
          <Image
            src="/logo.png"
            style={{ width: 55, height: 55, objectFit: "contain" }}
          />
        </View>

        {/* RIGHT 35 % — address */}
        <View style={s.letterheadRight}>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            Room 116, Building 1,
          </Text>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            258-288 Youdong Road,
          </Text>
          <Text style={[s.letterheadText, { textAlign: "right" }]}>
            Minhang District, Shanghai, China
          </Text>
        </View>
      </View>
      <View style={s.letterheadDivider} />
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        www.taifukai.com | info@taifukai.com | License: 91310000MAE2LJA47A
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

/* ── Main PDF ──────────────────────────────────────────────── */

export default function SalesContractPDF({
  data,
  totals,
  contractNumber,
}: Props) {
  const filledItems = data.lineItems.filter((item) => item.product);

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Letterhead />
        <Footer />

        {/* TITLE */}
        <Text style={s.title}>SALES CONTRACT</Text>

        {/* CONTRACT INFO — evenly spaced across page width */}
        <View style={s.contractInfoRow}>
          <Text>
            <Text style={s.contractInfoLabel}>Contract No: </Text>
            <Text style={s.contractInfoValueBold}>
              {contractNumber || "\u2014"}
            </Text>
          </Text>
          <Text>
            <Text style={s.contractInfoLabel}>Contract Date: </Text>
            <Text style={s.contractInfoValue}>
              {formatDate(data.identifiers.contractDate)}
            </Text>
          </Text>
          <Text>
            <Text style={s.contractInfoLabel}>Invoice Date: </Text>
            <Text style={s.contractInfoValue}>
              {formatDate(data.identifiers.invoiceDate)}
            </Text>
          </Text>
        </View>

        {/* Optional IDs — second row only if any exist */}
        {(data.identifiers.sealNumber ||
          data.identifiers.containerNumber ||
          data.identifiers.blNumber) && (
          <View style={s.contractInfoRowNoBorder}>
            {data.identifiers.sealNumber ? (
              <Text>
                <Text style={s.contractInfoLabel}>Seal No: </Text>
                <Text style={s.contractInfoValue}>
                  {data.identifiers.sealNumber}
                </Text>
              </Text>
            ) : null}
            {data.identifiers.containerNumber ? (
              <Text>
                <Text style={s.contractInfoLabel}>Container No: </Text>
                <Text style={s.contractInfoValue}>
                  {data.identifiers.containerNumber}
                </Text>
              </Text>
            ) : null}
            {data.identifiers.blNumber ? (
              <Text>
                <Text style={s.contractInfoLabel}>B/L No: </Text>
                <Text style={s.contractInfoValue}>
                  {data.identifiers.blNumber}
                </Text>
              </Text>
            ) : null}
          </View>
        )}

        {/* SELLER & BUYER */}
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>SELLER</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>
              {data.seller.company}
            </Text>
            <Text style={{ fontSize: 9 }}>{data.seller.address}</Text>
            <Text style={{ fontSize: 9 }}>Tel: {data.seller.tel}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.seller.email}</Text>
          </View>
          <View style={s.halfCol}>
            <Text style={s.sectionTitle}>BUYER / CONSIGNEE</Text>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 9 }}>
              {data.buyer.company || "\u2014"}
            </Text>
            <Text style={{ fontSize: 9 }}>{data.buyer.address}</Text>
            {data.buyer.additionalNumber ? (
              <Text style={{ fontSize: 9 }}>
                Add. No: {data.buyer.additionalNumber}
              </Text>
            ) : null}
            <Text style={{ fontSize: 9 }}>{data.buyer.cityPostal}</Text>
            <Text style={{ fontSize: 9 }}>Email: {data.buyer.email}</Text>
            {data.buyer.ccEmail ? (
              <Text style={{ fontSize: 9 }}>CC: {data.buyer.ccEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* SHIPPING */}
        <Text style={s.sectionTitle}>SHIPPING & DELIVERY</Text>
        <View style={s.twoCol}>
          <View style={s.halfCol}>
            <View style={s.row}>
              <Text style={s.labelCol}>Loading Port:</Text>
              <Text style={s.valueCol}>{data.shipping.loadingPort}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelCol}>Discharge Port:</Text>
              <Text style={s.valueCol}>
                {data.shipping.dischargePort || "\u2014"}
              </Text>
            </View>
          </View>
          <View style={s.halfCol}>
            <View style={s.row}>
              <Text style={s.labelCol}>Incoterm:</Text>
              <Text style={s.valueCol}>{data.shipping.incoterm}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelCol}>Origin:</Text>
              <Text style={s.valueCol}>{data.shipping.origin}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelCol}>Delivery From:</Text>
              <Text style={s.valueCol}>
                {formatDate(data.shipping.deliveryFrom)}
              </Text>
            </View>
          </View>
        </View>

        {/* ITEMS TABLE */}
        <Text style={s.sectionTitle}>GOODS DESCRIPTION</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderText, s.colProduct]}>Product</Text>
            <Text style={[s.tableHeaderText, s.colHS]}>HS Code</Text>
            <Text style={[s.tableHeaderText, s.colNW]}>N.W./Ctn</Text>
            <Text style={[s.tableHeaderText, s.colGW]}>G.W./Ctn</Text>
            <Text style={[s.tableHeaderText, s.colCtns]}>Cartons</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty (MTS)</Text>
            <Text style={[s.tableHeaderText, s.colPrice]}>Price/MT</Text>
            <Text style={[s.tableHeaderText, s.colPriceCtn]}>Price/Ctn</Text>
            <Text style={[s.tableHeaderText, s.colTotal]}>Amount</Text>
          </View>
          {filledItems.map((item, i) => {
            const cartons =
              typeof item.cartons === "number" ? item.cartons : 0;
            const amount = item.pricePerCarton * cartons;
            return (
              <View style={s.tableRow} key={i}>
                <Text style={[{ fontSize: 9 }, s.colProduct]}>
                  {item.product}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colHS]}>{item.hsCode}</Text>
                <Text style={[{ fontSize: 9 }, s.colNW]}>
                  {item.nwPerCarton !== ""
                    ? fmt(item.nwPerCarton as number)
                    : ""}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colGW]}>
                  {item.gwPerCarton !== ""
                    ? fmt(item.gwPerCarton as number)
                    : ""}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colCtns]}>
                  {cartons || ""}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colQty]}>
                  {fmt(item.qtyMTS, 3)}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colPrice]}>
                  {item.pricePerMT !== ""
                    ? fmtUSD(item.pricePerMT as number)
                    : ""}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colPriceCtn]}>
                  {fmtUSD(item.pricePerCarton)}
                </Text>
                <Text style={[{ fontSize: 9 }, s.colTotal]}>
                  {fmtUSD(amount)}
                </Text>
              </View>
            );
          })}
          <View style={s.tableTotalRow}>
            <Text
              style={[
                { fontSize: 9, fontFamily: "Times-Bold" },
                s.colProduct,
              ]}
            >
              TOTAL
            </Text>
            <Text style={[{ fontSize: 9 }, s.colHS]}></Text>
            <Text style={[{ fontSize: 9 }, s.colNW]}></Text>
            <Text style={[{ fontSize: 9 }, s.colGW]}></Text>
            <Text
              style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colCtns]}
            >
              {totals.totalCartons}
            </Text>
            <Text
              style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colQty]}
            >
              {fmt(totals.totalQtyMTS, 3)}
            </Text>
            <Text style={[{ fontSize: 9 }, s.colPrice]}></Text>
            <Text style={[{ fontSize: 9 }, s.colPriceCtn]}></Text>
            <Text
              style={[{ fontSize: 9, fontFamily: "Times-Bold" }, s.colTotal]}
            >
              {fmtUSD(totals.totalUSD)}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 3,
          }}
        >
          <Text style={{ fontSize: 8 }}>
            Total N.W.: {fmt(totals.totalNetWeight)} KG | Total G.W.:{" "}
            {fmt(totals.totalGrossWeight)} KG
          </Text>
        </View>

        {/* TERMS */}
        <View wrap={false}>
          <Text style={s.sectionTitle}>TERMS & CONDITIONS</Text>
          <View style={{ marginTop: 2 }}>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>1. ORIGIN: </Text>
                {data.shipping.origin}
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>2. BRAND: </Text>
                {data.terms.brand}
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>3. DELIVERY: </Text>
                {data.shipping.incoterm} — from {data.shipping.loadingPort} to{" "}
                {data.shipping.dischargePort || "\u2014"}
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>4. PACKING: </Text>
                {data.terms.containerType}
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>
                  5. DAMAGE ALLOWANCE:{" "}
                </Text>
                {data.terms.damageAllowance} of invoice value
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>6. PAYMENT: </Text>
                T/T (Telegraphic Transfer) to seller&apos;s bank account below.
              </Text>
            </View>
            <View style={s.termItem}>
              <Text>
                <Text style={{ fontFamily: "Times-Bold" }}>7. VALIDITY: </Text>
                This contract is valid until{" "}
                {formatDate(data.terms.contractValidTo)}.
              </Text>
            </View>
          </View>
        </View>

        {/* BANK DETAILS */}
        <View wrap={false}>
          <Text style={s.sectionTitle}>BANK DETAILS</Text>
          <View style={s.twoCol}>
            <View style={s.halfCol}>
              <View style={s.row}>
                <Text style={s.labelCol}>SWIFT:</Text>
                <Text style={s.valueCol}>{data.bank.swift}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.labelCol}>Beneficiary:</Text>
                <Text style={s.valueCol}>{data.bank.beneficiary}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.labelCol}>Account No:</Text>
                <Text style={s.valueCol}>{data.bank.account}</Text>
              </View>
            </View>
            <View style={s.halfCol}>
              <View style={s.row}>
                <Text style={s.labelCol}>Bank:</Text>
                <Text style={s.valueCol}>{data.bank.bank}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.labelCol}>Bank Address:</Text>
                <Text style={s.valueCol}>{data.bank.bankAddress}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.labelCol}>Post Code:</Text>
                <Text style={s.valueCol}>{data.bank.postCode}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* SIGNATURES */}
        <View wrap={false}>
          <View style={s.signatureArea}>
            <SellerSignatureBlock
              stamp={data.seller.stamp}
              company={data.seller.company}
            />
            <View style={s.buyerBlock}>
              <Text style={s.buyerLine}>BUYER</Text>
              <Text style={{ fontSize: 8, marginTop: 2 }}>
                {data.buyer.company || "\u2014"}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
