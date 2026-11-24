import { NextResponse } from "next/server";
import { organizations, sql } from "@golive/db";
import { db } from "@/server/db";
import { mailConfigured } from "@/server/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public settings the sign-in page needs. */
export async function GET() {
  // Sign-up is open only until the first account has created the organization.
  const [{ n } = { n: 0 }] = await db().select({ n: sql<number>`count(*)::int` }).from(organizations);
  return NextResponse.json({ mail: mailConfigured(), signup: n === 0 ? "first" : "invite" });
}
