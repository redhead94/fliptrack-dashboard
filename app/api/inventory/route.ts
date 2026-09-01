import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_inventory (owner_key TEXT PRIMARY KEY, items JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";

const ownerKey = "fliptrack-shared-inventory";

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function GET() {
  try {
    const sql = database();
    await sql.query(tableSql);
    const rows = await sql`SELECT items FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    const items = rows[0]?.items ?? null;
    const corrected = Array.isArray(items) ? items.map((item: { model?: string; soldPrice?: number; netProfit?: number }) => item.model === "70408" && item.soldPrice === 49 && item.netProfit === 32.71 ? { ...item, cost: 16.85, poshEarnings: 32.71, netProfit: 15.86 } : item) : items;
    return NextResponse.json({ items: corrected });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  if (!Array.isArray(body.items)) return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 });
  try {
    const sql = database();
    await sql.query(tableSql);
    await sql`INSERT INTO fliptrack_inventory (owner_key, items) VALUES (${ownerKey}, ${JSON.stringify(body.items)}::jsonb) ON CONFLICT (owner_key) DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}
