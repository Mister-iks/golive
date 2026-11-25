import { NextResponse } from "next/server";
import { ENGINE_VERSION } from "@golive/engine";
import { sql } from "@golive/db";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_STALE_SECONDS = 120;

/**
 * Health check for monitoring (Uptime Kuma, Prometheus blackbox, a load balancer…).
 * 200 when the database answers and an audit worker was seen recently, 503 otherwise.
 * Public on purpose; it reveals no data.
 */
export async function GET() {
  let database = false;
  let worker = false;
  try {
    const rows = await db().execute<{ seen: number | null }>(
      sql`select extract(epoch from now() - max(seen_at))::int as seen from golive.worker_heartbeat`,
    );
    database = true;
    const seen = rows[0]?.seen;
    worker = seen !== null && seen !== undefined && seen <= WORKER_STALE_SECONDS;
  } catch {
    database = false;
  }
  const ok = database && worker;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, worker, version: ENGINE_VERSION },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
