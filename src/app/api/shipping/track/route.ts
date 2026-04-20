/**
 * POST /api/shipping/track
 *
 * Body: { token, blNumber?, containerNumber?, carrier?, cachedRequestId? }
 * Returns: { success, data?, error?, errorCode? }
 *
 * Proxies Shipsgo v2:
 *   POST https://api.shipsgo.com/v2/containers        (register)
 *   GET  https://api.shipsgo.com/v2/containers/{id}   (fetch)
 */

const SHIPSGO_BASE = "https://api.shipsgo.com/v2/containers";

type ErrorCode = "auth" | "not_found" | "rate_limit" | "quota" | "network" | "other";

function mapStatus(status: number): { error: string; errorCode: ErrorCode } {
  if (status === 401 || status === 403) return { error: "Invalid Shipsgo token \u2014 update in Settings", errorCode: "auth" };
  if (status === 404) return { error: "B/L not found \u2014 check the number", errorCode: "not_found" };
  if (status === 429) return { error: "Rate limit exceeded \u2014 try again in 1 hour", errorCode: "rate_limit" };
  if (status === 402) return { error: "Free tier used up \u2014 upgrade or wait for next month", errorCode: "quota" };
  return { error: `Shipsgo returned HTTP ${status}`, errorCode: "other" };
}

/** Try a list of keys in order, return first truthy string */
function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

/** Find an object by checking a few nested locations */
function findNested(obj: Record<string, unknown> | undefined, keys: string[]): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

/** Extract ISO yyyy-mm-dd from a date-ish string */
function toISODate(value: unknown): string {
  if (!value) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  const s = String(value);
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

interface NormalizedResult {
  requestId: string | null;
  shippingLine: string;
  vesselName: string;
  voyageNumber: string;
  etd: string;
  atd: string | null;
  eta: string;
  ata: string | null;
  portOfLoading: string;
  portOfDischarge: string;
  status: string;
  lastUpdated: string;
  rawResponse: unknown;
}

function normalize(raw: unknown, fallbackRequestId: string | null): NormalizedResult {
  const root = (raw ?? {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object") ? root.data as Record<string, unknown> : root;

  const requestId = pick(data, ["requestId", "request_id", "id"]) || fallbackRequestId || null;

  // Vessel / voyage can appear at top-level or inside nested objects
  const vesselObj = findNested(data, ["vessel", "currentVessel", "containerVessel"]);
  const voyageObj = findNested(data, ["voyage", "currentVoyage"]);
  const polObj = findNested(data, ["portOfLoading", "pol", "departurePort", "originPort"]);
  const podObj = findNested(data, ["portOfDischarge", "pod", "arrivalPort", "destinationPort"]);

  const vesselName = pick(vesselObj, ["name", "vesselName"]) || pick(data, ["vesselName", "vessel", "containerVessel"]);
  const voyageNumber = pick(voyageObj, ["number", "voyageNumber", "name"]) || pick(data, ["voyageNumber", "voyage", "currentVoyage"]);
  const shippingLine = pick(data, ["shippingLine", "carrier", "scacCode", "carrierName"]);
  const portOfLoading = pick(polObj, ["name", "port", "code"]) || pick(data, ["portOfLoading", "pol"]);
  const portOfDischarge = pick(podObj, ["name", "port", "code"]) || pick(data, ["portOfDischarge", "pod"]);

  const etd = toISODate(pick(data, ["etd", "estimatedDepartureDate", "etdDate", "departureEstimatedDate"]));
  const atd = toISODate(pick(data, ["atd", "actualDepartureDate", "atdDate", "departureActualDate"])) || null;
  const eta = toISODate(pick(data, ["eta", "estimatedArrivalDate", "etaDate", "arrivalEstimatedDate"]));
  const ata = toISODate(pick(data, ["ata", "actualArrivalDate", "ataDate", "arrivalActualDate"])) || null;

  const status = pick(data, ["status", "liveMapStatus"]);
  const lastUpdated = pick(data, ["lastUpdated", "updatedAt", "lastEventDate"]) || new Date().toISOString();

  return {
    requestId: requestId || null,
    shippingLine, vesselName, voyageNumber,
    etd, atd: atd || null, eta, ata: ata || null,
    portOfLoading, portOfDischarge,
    status, lastUpdated,
    rawResponse: raw,
  };
}

export async function POST(request: Request) {
  let body: { token?: string; blNumber?: string; containerNumber?: string; carrier?: string; cachedRequestId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body", errorCode: "other" }, { status: 400 });
  }

  const token = body.token?.trim();
  const reference = (body.containerNumber || body.blNumber || "").trim();

  if (!token) return Response.json({ success: false, error: "Missing Shipsgo token", errorCode: "auth" }, { status: 400 });
  if (!reference && !body.cachedRequestId) {
    return Response.json({ success: false, error: "Provide a B/L or container number", errorCode: "other" }, { status: 400 });
  }

  const headers = {
    "X-Shipsgo-User-Token": token,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  try {
    // 1) Obtain a request ID — use cached one or register a new tracking request
    let requestId = body.cachedRequestId?.trim() || null;

    if (!requestId) {
      const regBody: Record<string, string> = { container: reference };
      if (body.carrier) regBody.shippingLine = body.carrier;

      const regRes = await fetch(SHIPSGO_BASE, {
        method: "POST",
        headers,
        body: JSON.stringify(regBody),
      });

      if (!regRes.ok) {
        const mapped = mapStatus(regRes.status);
        let detail = "";
        try { detail = (await regRes.text()).slice(0, 200); } catch { /* ignore */ }
        return Response.json({ success: false, error: `${mapped.error}${detail ? ` \u2014 ${detail}` : ""}`, errorCode: mapped.errorCode }, { status: 200 });
      }

      const regJson = await regRes.json().catch(() => null);
      const regData = (regJson && typeof regJson === "object") ? regJson as Record<string, unknown> : {};
      const regInner = (regData.data && typeof regData.data === "object" ? regData.data as Record<string, unknown> : regData);
      requestId = pick(regInner, ["requestId", "request_id", "id"]) || null;

      if (!requestId) {
        return Response.json({
          success: false,
          error: "Shipsgo did not return a tracking ID. Response: " + JSON.stringify(regJson).slice(0, 200),
          errorCode: "other",
        });
      }
    }

    // 2) Fetch the tracking status
    const getRes = await fetch(`${SHIPSGO_BASE}/${encodeURIComponent(requestId)}`, { headers });
    if (!getRes.ok) {
      const mapped = mapStatus(getRes.status);
      return Response.json({ success: false, error: mapped.error, errorCode: mapped.errorCode });
    }

    const getJson = await getRes.json().catch(() => null);
    const normalized = normalize(getJson, requestId);
    return Response.json({ success: true, data: normalized });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, error: `Network error: ${msg.slice(0, 200)}`, errorCode: "network" });
  }
}
