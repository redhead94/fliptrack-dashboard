import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

const ownerKey = "fliptrack-shared-inventory";
const tableSql = "CREATE TABLE IF NOT EXISTS fliptrack_inventory (owner_key TEXT PRIMARY KEY, items JSONB NOT NULL, deleted_ids JSONB NOT NULL DEFAULT '[]'::jsonb, revision BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
const revisionSql = "ALTER TABLE fliptrack_inventory ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0";
const deletedIdsSql = "ALTER TABLE fliptrack_inventory ADD COLUMN IF NOT EXISTS deleted_ids JSONB NOT NULL DEFAULT '[]'::jsonb";
const MAX_PAYLOAD_BYTES = 1_000_000;
let schemaReady: Promise<void> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

function ensureSchema(sql: ReturnType<typeof database>) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql.query(tableSql);
      await sql.query(revisionSql);
      await sql.query(deletedIdsSql);
    })();
    void schemaReady.catch(() => { schemaReady = undefined; });
  }
  return schemaReady;
}

function stringIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function authorized(request: Request) {
  const expected = process.env.NEXT_PUBLIC_FLIPTRACK_SYNC_KEY;
  if (!expected) return true;
  return request.headers.get("x-fliptrack-key") === expected;
}

function unauthorized() {
  return NextResponse.json({ error: "This FlipTrack sync is private. Add the shared key to your Vercel project." }, { status: 401 });
}

function validItems(value: unknown): value is Array<{ id: string }> {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string");
}

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  try {
    const sql = database();
    await ensureSchema(sql);
    const rows = await sql`SELECT items, deleted_ids, revision, updated_at FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    const deletedIds = stringIds(rows[0]?.deleted_ids);
    const items = Array.isArray(rows[0]?.items) ? rows[0].items.filter((item: { id?: unknown }) => !deletedIds.includes(String(item.id))) : [];
    return NextResponse.json({ items, deletedIds, revision: rows[0] ? Number(rows[0].revision) : 0, updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null });
  } catch (error) {
    console.error("FlipTrack inventory GET failed", error);
    return NextResponse.json({ error: "Inventory could not connect to the database." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!authorized(request)) return unauthorized();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: "Inventory payload is too large." }, { status: 413 });
  let body: { items?: unknown; deletedIds?: unknown; revision?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 }); }
  if (!validItems(body.items)) return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 });
  const baseRevision = Number.isFinite(Number(body.revision)) ? Number(body.revision) : 0;
  const requestedDeletedIds = stringIds(body.deletedIds);
  try {
    const sql = database();
    await ensureSchema(sql);
    const current = await sql`SELECT deleted_ids FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    const deletedIds = [...new Set([...stringIds(current[0]?.deleted_ids), ...requestedDeletedIds])];
    const items = body.items.filter((item) => !deletedIds.includes(item.id));
    const payload = JSON.stringify(items);
    const deletedPayload = JSON.stringify(deletedIds);
    const updated = await sql`UPDATE fliptrack_inventory SET items = ${payload}::jsonb, deleted_ids = ${deletedPayload}::jsonb, revision = ${baseRevision + 1}, updated_at = NOW() WHERE owner_key = ${ownerKey} AND revision = ${baseRevision} RETURNING revision`;
    if (updated.length) return NextResponse.json({ ok: true, revision: Number(updated[0].revision) });
    const latest = await sql`SELECT items, deleted_ids, revision FROM fliptrack_inventory WHERE owner_key = ${ownerKey}`;
    if (!latest.length && baseRevision === 0) {
      const created = await sql`INSERT INTO fliptrack_inventory (owner_key, items, deleted_ids, revision) VALUES (${ownerKey}, ${payload}::jsonb, ${deletedPayload}::jsonb, 1) ON CONFLICT (owner_key) DO NOTHING RETURNING revision`;
      if (created.length) return NextResponse.json({ ok: true, revision: 1 });
    }
    return NextResponse.json({ error: "Inventory changed elsewhere. Sync the latest before saving.", conflict: true, items: latest[0]?.items ?? [], deletedIds: stringIds(latest[0]?.deleted_ids), revision: latest[0] ? Number(latest[0].revision) : 0 }, { status: 409 });
  } catch (error) {
    console.error("FlipTrack inventory PUT failed", error);
    return NextResponse.json({ error: "Inventory could not save to the database." }, { status: 503 });
  }
}
