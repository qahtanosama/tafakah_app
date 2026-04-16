import type { LineItem, Product, ContractTotals, SalesContractData } from "@/types/sales-contract";

export const PRODUCTS: Product[] = ["Fresh Ginger", "Fresh Garlic", "Fresh Kiwi", "Fresh Apple"];

export const HS_CODES: Record<Product, string> = {
  "Fresh Ginger": "0910.1100",
  "Fresh Garlic": "070320",
  "Fresh Kiwi": "081050",
  "Fresh Apple": "080810",
};

export const CONTRACT_PREFIXES: Record<Product, string> = {
  "Fresh Ginger": "GG",
  "Fresh Garlic": "GL",
  "Fresh Kiwi": "KW",
  "Fresh Apple": "APP",
};

export function getPrefix(firstProduct: Product | ""): string {
  if (!firstProduct) return "";
  return CONTRACT_PREFIXES[firstProduct];
}

export function generateContractNumber(year: number, sequenceNumber: number, firstProduct: Product | ""): string {
  if (!firstProduct || !sequenceNumber) return "";
  const prefix = CONTRACT_PREFIXES[firstProduct];
  return `${year}-${prefix}${sequenceNumber}`;
}

export function generateInvoiceNumber(year: number, sequenceNumber: number, firstProduct: Product | ""): string {
  if (!firstProduct || !sequenceNumber) return "";
  const prefix = CONTRACT_PREFIXES[firstProduct];
  return `TAFA${year}${prefix}${sequenceNumber}`;
}

export function calcQtyMTS(nwPerCarton: number | "", cartons: number | ""): number {
  const nw = typeof nwPerCarton === "number" ? nwPerCarton : 0;
  const c = typeof cartons === "number" ? cartons : 0;
  return (nw * c) / 1000;
}

export function calcPricePerCarton(nwPerCarton: number | "", pricePerMT: number | ""): number {
  const nw = typeof nwPerCarton === "number" ? nwPerCarton : 0;
  const p = typeof pricePerMT === "number" ? pricePerMT : 0;
  return (nw * p) / 1000;
}

export function calcTotals(lineItems: LineItem[]): ContractTotals {
  let totalCartons = 0;
  let totalQtyMTS = 0;
  let totalNetWeight = 0;
  let totalGrossWeight = 0;
  let totalUSD = 0;

  for (const item of lineItems) {
    const cartons = typeof item.cartons === "number" ? item.cartons : 0;
    const nw = typeof item.nwPerCarton === "number" ? item.nwPerCarton : 0;
    const gw = typeof item.gwPerCarton === "number" ? item.gwPerCarton : 0;

    totalCartons += cartons;
    totalQtyMTS += item.qtyMTS;
    totalNetWeight += nw * cartons;
    totalGrossWeight += gw * cartons;
    totalUSD += item.pricePerCarton * cartons;
  }

  return { totalCartons, totalQtyMTS, totalNetWeight, totalGrossWeight, totalUSD };
}

export function createEmptyLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    product: "",
    hsCode: "",
    nwPerCarton: "",
    gwPerCarton: "",
    cartons: "",
    qtyMTS: 0,
    pricePerMT: "",
    pricePerCarton: 0,
  };
}

export function getDefaultContractData(): SalesContractData {
  return {
    identifiers: {
      year: 2026,
      sequenceNumber: 0,
      contractDate: "",
      invoiceDate: "",
      sealNumber: "",
      containerNumber: "",
      blNumber: "",
    },
    seller: {
      company: "TAFAKAH Food (SHANGHAI) CO., LTD",
      address: "ROOM 116, BUILDING 1, 258-288 YOUDONG ROAD, MINHANG DISTRICT, SHANGHAI, CHINA",
      tel: "+86 187 2116 0270",
      email: "Info@taifukai.com",
    },
    buyer: {
      company: "",
      address: "",
      additionalNumber: "",
      cityPostal: "",
      email: "",
      ccEmail: "",
    },
    shipping: {
      loadingPort: "SHEKOU PORT, CHINA",
      dischargePort: "",
      deliveryFrom: "",
      incoterm: "CIF JEDDAH",
      origin: "CHINA",
    },
    lineItems: [createEmptyLineItem()],
    bank: {
      swift: "CZCBCN2X",
      beneficiary: "TAFAKAH Food (Shanghai) CO., LTD",
      account: "56512142010360000033",
      bank: "Zhejiang Chouzhou Commercial Bank Co., Ltd",
      bankAddress: "Yiwu Leyuan East Jiangbin Road, Yiwu, Zhejiang, China",
      postCode: "322100",
    },
    terms: {
      brand: "NO MARK",
      damageAllowance: "5%",
      contractValidTo: "",
      containerType: "1×40'RH",
    },
  };
}
