import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const ownerKey = "fliptrack-shared-inventory";
const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_bid_guide (owner_key TEXT PRIMARY KEY, bids JSONB NOT NULL DEFAULT '[]'::jsonb, revision BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
const MAX_PAYLOAD_BYTES = 1_000_000;
let schemaReady: Promise<void> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

function ensureSchema(sql: ReturnType<typeof database>) {
  if (!schemaReady) {
    schemaReady = sql.query(tableSql).then(() => undefined);
    void schemaReady.catch(() => { schemaReady = undefined; });
  }
  return schemaReady;
}

function authorized(request: Request) {
  const expected = process.env.NEXT_PUBLIC_FLIPTRACK_SYNC_KEY;
  if (!expected) return true;
  return request.headers.get("x-fliptrack-key") === expected;
}

function unauthorized() {
  return NextResponse.json({ error: "This FlipTrack sync is private. Add the shared key to your Vercel project." }, { status: 401 });
}

function validBids(value: unknown) {
  return Array.isArray(value) && value.every((bid) => typeof bid === "object" && bid !== null && typeof (bid as { model?: unknown }).model === "string" && typeof (bid as { name?: unknown }).name === "string" && typeof (bid as { maxBid?: unknown }).maxBid === "number");
}

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  try {
    const sql = database();
    await ensureSchema(sql);
    const rows = await sql`SELECT bids, revision, updated_at FROM fliptrack_bid_guide WHERE owner_key = ${ownerKey}`;
    return NextResponse.json({ bids: rows[0]?.bids ?? [], revision: rows[0] ? Number(rows[0].revision) : 0, updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null });
  } catch (error) {
    console.error("FlipTrack bid guide GET failed", error);
    return NextResponse.json({ error: "Bid Guide could not connect to the database." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return unauthorized();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: "Bid Guide payload is too large." }, { status: 413 });
  let body: { bids?: unknown; revision?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid bid guide payload." }, { status: 400 }); }
  if (!validBids(body.bids)) return NextResponse.json({ error: "Invalid bid guide payload." }, { status: 400 });
  const baseRevision = Number.isFinite(Number(body.revision)) ? Number(body.revision) : 0;
  try {
    const sql = database();
    await ensureSchema(sql);
    const payload = JSON.stringify(body.bids);
    const updated = await sql`UPDATE fliptrack_bid_guide SET bids = ${payload}::jsonb, revision = ${baseRevision + 1}, updated_at = NOW() WHERE owner_key = ${ownerKey} AND revision = ${baseRevision} RETURNING revision`;
    if (updated.length) return NextResponse.json({ ok: true, revision: Number(updated[0].revision) });
    const current = await sql`SELECT bids, revision FROM fliptrack_bid_guide WHERE owner_key = ${ownerKey}`;
    if (!current.length && baseRevision === 0) {
      const created = await sql`INSERT INTO fliptrack_bid_guide (owner_key, bids, revision) VALUES (${ownerKey}, ${payload}::jsonb, 1) ON CONFLICT (owner_key) DO NOTHING RETURNING revision`;
      if (created.length) return NextResponse.json({ ok: true, revision: 1 });
    }
    return NextResponse.json({ error: "Bid Guide changed elsewhere. Refresh and try again.", conflict: true, bids: current[0]?.bids ?? [], revision: current[0] ? Number(current[0].revision) : 0 }, { status: 409 });
  } catch (error) {
    console.error("FlipTrack bid guide PUT failed", error);
    return NextResponse.json({ error: "Bid Guide could not save to the database." }, { status: 503 });
  }
}
