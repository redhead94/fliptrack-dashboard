import { NextRequest, NextResponse } from "next/server";

const tokenUrl = "https://apis.usps.com/oauth2/v3/token";

export async function GET(request: NextRequest) {
  const tracking = request.nextUrl.searchParams.get("tracking")?.trim();
  const clientId = process.env.USPS_CONSUMER_KEY;
  const clientSecret = process.env.USPS_CONSUMER_SECRET;

  if (!tracking) return NextResponse.json({ error: "Enter a USPS tracking number first." }, { status: 400 });
  if (!clientId || !clientSecret) return NextResponse.json({ error: "USPS credentials have not been added to Vercel yet." }, { status: 503 });

  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), cache: "no-store" });
  if (!tokenResponse.ok) return NextResponse.json({ error: "USPS could not authenticate this app. Check the Vercel credentials and Tracking API access." }, { status: 502 });

  const token = (await tokenResponse.json()).access_token;
  const trackingResponse = await fetch(`https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(tracking)}?expand=DETAIL`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!trackingResponse.ok) return NextResponse.json({ error: "USPS could not retrieve that tracking number." }, { status: 502 });

  const result = await trackingResponse.json();
  return NextResponse.json({ status: result.status || result.TrackResults?.TrackInfo?.TrackSummary || "USPS update available", summary: result.statusSummary || result.TrackResults?.TrackInfo?.TrackSummary || "" });
}
