export type DocumentCategory =
  | "certificate_of_origin"
  | "bill_of_lading"
  | "phytosanitary_certificate"
  | "health_certificate"
  | "other"
  | "unknown";

export type DocSlot =
  | "certificate_of_origin"
  | "bill_of_lading"
  | "phytosanitary_certificate"
  | "health_certificate"
  | "other";

export interface ExtractedFields {
  [key: string]: string | undefined;
}

export interface ValidationResult {
  field: string;
  status: "match" | "mismatch" | "missing";
  expected?: string;
  actual?: string;
}

export type DocStatus = "uploading" | "analyzing" | "ready" | "error";

export interface TradeDocument {
  id: string;
  fileName: string;
  fileType: "pdf" | "image";
  mimeType: string;
  base64Data: string;
  slot: DocSlot;
  category: DocumentCategory;
  confidence: number;
  extractedFields: ExtractedFields;
  validationResults: ValidationResult[];
  status: DocStatus;
  error?: string;
  addedAt: string;
}

export interface AnalyzeRequest {
  provider?: "gemini" | "anthropic";
  apiKey?: string;
  fileBase64: string;
  fileName: string;
  mimeType: string;
  masterData?: {
    contractNo: string;
    buyer: string;
    origin: string;
    loadingPort: string;
    dischargePort: string;
    containerNumber: string;
    products: string[];
    hsCodes: string[];
    totalNetWeight: number;
    totalGrossWeight: number;
  };
}

export interface AnalyzeResponse {
  category: DocumentCategory;
  confidence: number;
  extractedFields: ExtractedFields;
  validationResults: ValidationResult[];
  mock?: boolean;
}

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  certificate_of_origin: "Certificate of Origin",
  bill_of_lading: "Bill of Lading",
  phytosanitary_certificate: "Phyto Certificate",
  health_certificate: "Health Certificate",
  other: "Other Attachment",
  unknown: "Unknown",
};

export const SLOT_LABELS: Record<DocSlot, string> = {
  certificate_of_origin: "Certificate of Origin",
  bill_of_lading: "Bill of Lading",
  phytosanitary_certificate: "Phytosanitary Certificate",
  health_certificate: "Health Certificate",
  other: "Other Attachments",
};

export const RECEIVED_SLOTS: DocSlot[] = [
  "certificate_of_origin",
  "bill_of_lading",
  "phytosanitary_certificate",
  "health_certificate",
  "other",
];

export function categoryToSlot(cat: DocumentCategory): DocSlot {
  if (cat === "certificate_of_origin" || cat === "bill_of_lading" || cat === "phytosanitary_certificate" || cat === "health_certificate") {
    return cat;
  }
  return "other";
}
