import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalyzeRequest, AnalyzeResponse, DocumentCategory, ValidationResult } from "@/types/document";

const PROMPT = `You are a trade document analyst. Analyze this document and return ONLY valid JSON (no markdown, no code fences).

Classify it as exactly one of: "certificate_of_origin", "bill_of_lading", "phytosanitary_certificate", "health_certificate", "unknown".

Then extract all relevant fields based on the document type:

For certificate_of_origin: extract issuing_country, exporter_name, consignee_name, hs_codes (array), goods_description, certificate_no, issue_date
For bill_of_lading: extract bl_number, vessel_name, voyage_no, port_of_loading, port_of_discharge, container_numbers (array), shipper, consignee, gross_weight, net_weight, number_of_packages
For phytosanitary_certificate: extract certificate_no, exporting_country, importing_country, place_of_origin, declared_point_of_entry, treatment_details, issue_date

Return JSON format:
{
  "category": "certificate_of_origin",
  "confidence": 0.95,
  "extractedFields": {
    "certificate_no": "123456",
    "exporter_name": "TAFAKAH Food",
    ...
  }
}`;

function getMockResponse(body: AnalyzeRequest): AnalyzeResponse {
  const name = body.fileName.toLowerCase();
  let category: DocumentCategory = "unknown";
  let confidence = 0.5;
  if (name.includes("co") || name.includes("origin")) { category = "certificate_of_origin"; confidence = 0.9; }
  else if (name.includes("bl") || name.includes("lading")) { category = "bill_of_lading"; confidence = 0.88; }
  else if (name.includes("phyto") || name.includes("plant")) { category = "phytosanitary_certificate"; confidence = 0.85; }
  else if (name.includes("health") || name.includes("sanitary")) { category = "health_certificate"; confidence = 0.82; }

  const vr: ValidationResult[] = [];
  if (body.masterData) {
    vr.push({ field: "Buyer/Consignee", status: "match", expected: body.masterData.buyer, actual: body.masterData.buyer });
    vr.push({ field: "Origin", status: "match", expected: body.masterData.origin, actual: body.masterData.origin });
  }
  return { category, confidence, extractedFields: { documentNumber: "MOCK-" + Date.now().toString(36).toUpperCase(), importer: body.masterData?.buyer ?? "Unknown" }, validationResults: vr, mock: true };
}

function buildValidation(fields: Record<string, unknown>, md: AnalyzeRequest["masterData"]): ValidationResult[] {
  if (!md) return [];
  const r: ValidationResult[] = [];
  const consignee = (fields.consignee_name ?? fields.consignee ?? "") as string;
  if (consignee && md.buyer) {
    r.push({ field: "Consignee", status: consignee.toUpperCase().includes(md.buyer.toUpperCase().substring(0, 10)) ? "match" : "mismatch", expected: md.buyer, actual: consignee });
  }
  const containers = fields.container_numbers as string[] | undefined;
  if (containers && md.containerNumber) {
    const found = containers.join(", ");
    r.push({ field: "Container No", status: found.includes(md.containerNumber) ? "match" : "mismatch", expected: md.containerNumber, actual: found });
  }
  const discharge = (fields.port_of_discharge ?? "") as string;
  if (discharge && md.dischargePort) {
    r.push({ field: "Discharge Port", status: discharge.toUpperCase().includes(md.dischargePort.split(" ")[0].toUpperCase()) ? "match" : "mismatch", expected: md.dischargePort, actual: discharge });
  }
  const hsCodes = fields.hs_codes as string[] | undefined;
  if (hsCodes && md.hsCodes.length > 0) {
    const found = hsCodes.join(", ");
    r.push({ field: "HS Codes", status: md.hsCodes.some((c) => found.includes(c)) ? "match" : "mismatch", expected: md.hsCodes.join(", "), actual: found });
  }
  return r;
}

function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function analyzeWithGemini(apiKey: string, rawBase64: string, mimeType: string): Promise<Record<string, unknown>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([PROMPT, { inlineData: { data: rawBase64, mimeType } }]);
  return parseJsonResponse(result.response.text());
}

async function analyzeWithAnthropic(apiKey: string, rawBase64: string, mimeType: string): Promise<Record<string, unknown>> {
  const anthropic = new Anthropic({ apiKey });
  const isPdf = mimeType === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: rawBase64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mimeType as "image/png" | "image/jpeg", data: rawBase64 } };
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 1500,
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: PROMPT }] }],
  });
  const content = message.content[0];
  if (content.type !== "text") throw new Error("No text response from Claude");
  return parseJsonResponse(content.text);
}

export async function POST(request: Request) {
  const body: AnalyzeRequest = await request.json();

  // Resolve API key: prefer request body, fall back to env
  const provider = body.provider ?? "gemini";
  let apiKey = body.apiKey ?? "";
  if (!apiKey) {
    apiKey = provider === "gemini"
      ? (process.env.GEMINI_API_KEY ?? "")
      : (process.env.ANTHROPIC_API_KEY ?? "");
  }

  if (!apiKey || apiKey === "YOUR-GEMINI-KEY-HERE" || apiKey === "your-api-key-here") {
    return Response.json(getMockResponse(body));
  }

  try {
    const rawBase64 = body.fileBase64.includes(",") ? body.fileBase64.split(",")[1] : body.fileBase64;
    const parsed = provider === "anthropic"
      ? await analyzeWithAnthropic(apiKey, rawBase64, body.mimeType)
      : await analyzeWithGemini(apiKey, rawBase64, body.mimeType);

    const response: AnalyzeResponse = {
      category: (parsed.category as DocumentCategory) ?? "unknown",
      confidence: (parsed.confidence as number) ?? 0.5,
      extractedFields: (parsed.extractedFields ?? parsed.fields ?? {}) as AnalyzeResponse["extractedFields"],
      validationResults: buildValidation((parsed.extractedFields ?? parsed.fields ?? {}) as Record<string, unknown>, body.masterData),
    };
    return Response.json(response);
  } catch (err) {
    console.error(`${provider} API error:`, err);
    const mock = getMockResponse(body);
    mock.extractedFields._error = String(err);
    return Response.json(mock);
  }
}
