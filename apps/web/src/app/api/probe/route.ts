import { NextResponse, type NextRequest } from "next/server";
import { probe } from "@golive/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-memory rate limit: the robot must not become a scanning service.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function limited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Trop d'audits en une minute. Réessayez plus tard." }, { status: 429 });
  }

  let body: { url?: unknown; env?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return NextResponse.json({ error: "URL manquante." }, { status: 400 });
  }
  const env = body.env === "preprod" ? "preprod" : "prod";

  const observation = await probe(body.url, { env, allowPrivate: process.env.GOLIVE_ALLOW_PRIVATE === "1" });
  return NextResponse.json(observation);
}
