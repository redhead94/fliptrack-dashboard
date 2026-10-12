import { NextRequest, NextResponse } from "next/server";

const tokenUrl = "https://apis.usps.com/oauth2/v3/token";
const TOKEN_TTL_MS = 30 * 60_000;
const RESULT_TTL_MS = 5 * 60_000;

type TokenCache = { token: string; expiresAt: number } | undefined;
type ResultCache = { status: string; summary: string; expiresAt: number };

let tokenCache: TokenCache = undefined;

const resultCache = new Map<string, ResultCache>();

async function accessToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), cache: "no-store" });
  if (!tokenResponse.ok) throw new Error("USPS auth failed");
  const { access_token } = await tokenResponse.json();
  tokenCache = { token: access_token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return access_token;
}

export async function GET(request: NextRequest) {
  const tracking = request.nextUrl.searchParams.get("tracking")?.trim();
  const clientId = process.env.USPS_CONSUMER_KEY;
  const clientSecret = process.env.USPS_CONSUMER_SECRET;

  if (!tracking) return NextResponse.json({ error: "Enter a USPS tracking number first." }, { status: 400 });
  if (!clientId || !clientSecret) return NextResponse.json({ error: "USPS credentials have not been added to Vercel yet." }, { status: 503 });

  const cached = resultCache.get(tracking);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ status: cached.status, summary: cached.summary, cached: true });

  try {
    const token = await accessToken(clientId, clientSecret);
    const trackingResponse = await fetch(`https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(tracking)}?expand=DETAIL`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!trackingResponse.ok) return NextResponse.json({ error: "USPS could not retrieve that tracking number." }, { status: 502 });

    const result = await trackingResponse.json();
    const status = result.status || result.TrackResults?.TrackInfo?.TrackSummary || "USPS update available";
    const summary = result.statusSummary || result.TrackResults?.TrackInfo?.TrackSummary || "";
    resultCache.set(tracking, { status, summary, expiresAt: Date.now() + RESULT_TTL_MS });
    return NextResponse.json({ status, summary });
  } catch (error) {
    console.error("FlipTrack USPS tracking lookup failed", error);
    return NextResponse.json({ error: "USPS could not retrieve that tracking number." }, { status: 502 });
  }
}
