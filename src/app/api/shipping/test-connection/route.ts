/**
 * POST /api/shipping/test-connection
 * Body: { token: string }
 *
 * Hits a cheap Shipsgo endpoint to verify the token is accepted.
 * Doesn't consume a tracking request.
 */

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, message: "Invalid JSON body" });
  }

  const token = body.token?.trim();
  if (!token) return Response.json({ success: false, message: "No token provided" });

  try {
    // Shipsgo has a "whoami"-ish endpoint under /v2/users, but availability varies by plan.
    // We hit the containers list endpoint with a HEAD-like request: any valid token yields 200/204
    // even with no results. Invalid token yields 401.
    const res = await fetch("https://api.shipsgo.com/v2/containers?limit=1", {
      method: "GET",
      headers: {
        "X-Shipsgo-User-Token": token,
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      return Response.json({ success: true, message: "Connected \u2014 token accepted by Shipsgo" });
    }
    if (res.status === 401 || res.status === 403) {
      return Response.json({ success: false, message: "Invalid token \u2014 check it on shipsgo.com" });
    }
    const text = (await res.text()).slice(0, 200);
    return Response.json({ success: false, message: `Shipsgo returned HTTP ${res.status}${text ? ` \u2014 ${text}` : ""}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, message: `Network error: ${msg.slice(0, 200)}` });
  }
}
