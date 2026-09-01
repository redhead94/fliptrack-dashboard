import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_inventory (owner_key TEXT PRIMARY KEY, items JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";

function ownerKey(request: NextRequest) {
  const syncCode = request.headers.get("x-fliptrack-sync-code");
  if (!syncCode || syncCode.length < 8) return null;
  return createHash("sha256").update(syncCode).digest("hex");
}

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function GET(request: NextRequest) {
  const key = ownerKey(request);
  if (!key) return NextResponse.json({ error: "A sync code of at least 8 characters is required." }, { status: 401 });
  try {
    const sql = database();
    await sql.query(tableSql);
    const rows = await sql`SELECT items FROM fliptrack_inventory WHERE owner_key = ${key}`;
    return NextResponse.json({ items: rows[0]?.items ?? null });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const key = ownerKey(request);
  if (!key) return NextResponse.json({ error: "A sync code of at least 8 characters is required." }, { status: 401 });
  const body = await request.json();
  if (!Array.isArray(body.items)) return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 });
  try {
    const sql = database();
    await sql.query(tableSql);
    await sql`INSERT INTO fliptrack_inventory (owner_key, items) VALUES (${key}, ${JSON.stringify(body.items)}::jsonb) ON CONFLICT (owner_key) DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}
