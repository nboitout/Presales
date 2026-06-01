import { NextResponse } from "next/server";

/* TEMPORARY diagnostic endpoint — surfaces the real DB error that the normal
 * routes hide behind a generic 500. Safe to delete once persistence works.
 * It never prints secrets: the connection string is masked to host only. */

export const dynamic = "force-dynamic";

function maskedTarget(): string {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "***" : "(no-user)"}@${u.hostname}:${u.port || "(default)"}${u.pathname} sslmode=${u.searchParams.get("sslmode") ?? "(unset)"}`;
  } catch {
    return "(POSTGRES_URL is set but is NOT a valid URL — likely an un-encoded special char in the password)";
  }
}

export async function GET() {
  const stages: Record<string, unknown> = {
    usePg: Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    target: maskedTarget(),
  };

  // Stage 1: raw connection + trivial query (isolates connection problems).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require("pg");
    const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 8000,
    });
    const r = await pool.query("SELECT 1 AS ok");
    stages.connect = { ok: true, result: r.rows[0] };
    await pool.end();
  } catch (e) {
    const err = e as { message?: string; code?: string };
    stages.connect = { ok: false, code: err.code, message: err.message };
    // No point testing the query if we can't even connect.
    return NextResponse.json(stages);
  }

  // Stage 2: the actual app query (isolates SQL / schema problems).
  try {
    const db = await import("@/lib/db");
    const decks = await db.listDecksByRep("__diagnostic_no_such_rep__");
    stages.listDecks = { ok: true, count: decks.length };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    stages.listDecks = { ok: false, code: err.code, message: err.message };
  }

  return NextResponse.json(stages);
}
