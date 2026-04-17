import { Font, StyleSheet } from "@react-pdf/renderer";

Font.register({
  family: "NotoSansSC",
  src: "/fonts/NotoSansSC-Regular.ttf",
});

export const GRAY_BORDER = "#CCCCCC";
export const LIGHT_BG = "#F2F2F2";

export const s = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    paddingTop: 15,
    paddingBottom: 50,
    paddingHorizontal: 42,
    lineHeight: 1.35,
  },
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
  letterheadRight: { width: "35%", alignItems: "flex-end" },
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
  title: {
    fontSize: 18,
    fontFamily: "Times-Bold",
    textAlign: "center",
    color: "#000000",
    marginTop: 4,
    marginBottom: 6,
  },
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
  contractInfoLabel: { fontFamily: "Times-Bold", fontSize: 10, marginRight: 4 },
  contractInfoValue: { fontSize: 10 },
  contractInfoValueBold: { fontSize: 10, fontFamily: "Times-Bold" },
  row: { flexDirection: "row", marginBottom: 1.5 },
  labelCol: { width: 85, fontFamily: "Times-Bold", fontSize: 9 },
  valueCol: { flex: 1, fontSize: 9 },
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
  twoCol: { flexDirection: "row", gap: 16 },
  halfCol: { flex: 1 },
  table: { marginTop: 4, borderWidth: 0.5, borderColor: GRAY_BORDER },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: LIGHT_BG,
    minHeight: 18,
    alignItems: "center",
  },
  tableHeaderText: { color: "#000000", fontFamily: "Times-Bold", fontSize: 7.5 },
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
  colNW: { width: "10%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colGW: { width: "10%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colCtns: { width: "10%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colQty: { width: "11%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colPrice: { width: "12%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colPriceCtn: { width: "10%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  colTotal: { width: "10%", paddingHorizontal: 3, paddingVertical: 2, textAlign: "right" },
  termItem: { marginBottom: 3, fontSize: 9 },
  signatureArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  buyerBlock: { width: "40%", height: 75, textAlign: "center" },
  buyerLine: {
    borderTopWidth: 1,
    borderColor: "#000",
    marginTop: 45,
    paddingTop: 4,
    fontFamily: "Times-Bold",
    fontSize: 9,
  },
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

export function formatDate(d: string): string {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

export function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
