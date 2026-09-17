import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const ownerKey = "fliptrack-shared-inventory";

const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_inventory (owner_key TEXT PRIMARY KEY, items JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
const revisionSql = "ALTER TABLE fliptrack_inventory ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0";

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

async function ensureSchema(sql: ReturnType<typeof database>) {
  await sql.query(tableSql);
  await sql.query(revisionSql);
  const rows = await sql`SELECT items FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
  const items = rows[0]?.items;
  if (!Array.isArray(items)) return;
  const fixed = items.map((item: { model?: string }) => (item.model === "70408" ? { ...item, cost: 16.85, poshEarnings: 32.71 } : item));
  if (JSON.stringify(fixed) !== JSON.stringify(items)) {
    await sql`UPDATE fliptrack_inventory SET items = ${JSON.stringify(fixed)}::jsonb, revision = revision + 1, updated_at = NOW() WHERE owner_key = ${ownerKey}`;
  }
}

export async function GET() {
  try {
    const sql = database();
    await ensureSchema(sql);
    const rows = await sql`SELECT items, revision, updated_at FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    const items = rows[0]?.items ?? null;
    return NextResponse.json({ items, revision: rows[0] ? Number(rows[0].revision) : 0, updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  if (!Array.isArray(body.items)) return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 });
  const baseRevision = Number.isFinite(Number(body.revision)) ? Number(body.revision) : 0;
  const payload = JSON.stringify(body.items);
  try {
    const sql = database();
    await ensureSchema(sql);
    const updated = await sql`UPDATE fliptrack_inventory SET items = ${payload}::jsonb, revision = ${baseRevision + 1}, updated_at = NOW() WHERE owner_key = ${ownerKey} AND revision = ${baseRevision} RETURNING revision`;
    if (updated.length) return NextResponse.json({ ok: true, revision: Number(updated[0].revision) });
    const current = await sql`SELECT items, revision FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    if (!current.length && baseRevision === 0) {
      try {
        const created = await sql`INSERT INTO fliptrack_inventory (owner_key, items, revision) VALUES (${ownerKey}, ${payload}::jsonb, 1) ON CONFLICT (owner_key) DO NOTHING RETURNING revision`;
        if (created.length) return NextResponse.json({ ok: true, revision: 1 });
      } catch {
        return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
      }
    }
    const conflictItems = current[0]?.items ?? null;
    return NextResponse.json({ error: "Inventory changed elsewhere. Sync the latest before saving.", conflict: true, items: conflictItems, revision: current[0] ? Number(current[0].revision) : 0 }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Database connection is not ready yet." }, { status: 503 });
  }
}

