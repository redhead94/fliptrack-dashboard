import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const ownerKey = "fliptrack-shared-inventory";
const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_bid_guide (owner_key TEXT PRIMARY KEY, bids JSONB NOT NULL DEFAULT '[]'::jsonb, revision BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function GET() {
  try {
    const sql = database();
    await sql.query(tableSql);
    const rows = await sql`SELECT bids, revision, updated_at FROM fliptrack_bid_guide WHERE owner_key = ${ownerKey}`;
    return NextResponse.json({ bids: rows[0]?.bids ?? [], revision: rows[0] ? Number(rows[0].revision) : 0, updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null });
  } catch {
    return NextResponse.json({ error: "Bid Guide could not connect to the database." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  if (!Array.isArray(body.bids)) return NextResponse.json({ error: "Invalid bid guide payload." }, { status: 400 });
  const baseRevision = Number.isFinite(Number(body.revision)) ? Number(body.revision) : 0;
  try {
    const sql = database();
    await sql.query(tableSql);
    const payload = JSON.stringify(body.bids);
    const updated = await sql`UPDATE fliptrack_bid_guide SET bids = ${payload}::jsonb, revision = ${baseRevision + 1}, updated_at = NOW() WHERE owner_key = ${ownerKey} AND revision = ${baseRevision} RETURNING revision`;
    if (updated.length) return NextResponse.json({ ok: true, revision: Number(updated[0].revision) });
    const current = await sql`SELECT bids, revision FROM fliptrack_bid_guide WHERE owner_key = ${ownerKey}`;
    if (!current.length && baseRevision === 0) {
      const created = await sql`INSERT INTO fliptrack_bid_guide (owner_key, bids, revision) VALUES (${ownerKey}, ${payload}::jsonb, 1) ON CONFLICT (owner_key) DO NOTHING RETURNING revision`;
      if (created.length) return NextResponse.json({ ok: true, revision: 1 });
    }
    return NextResponse.json({ error: "Bid Guide changed elsewhere. Refresh and try again.", conflict: true, bids: current[0]?.bids ?? [], revision: current[0] ? Number(current[0].revision) : 0 }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Bid Guide could not save to the database." }, { status: 503 });
  }
}
