import { NextResponse } from "next/server";
import { mailConfigured } from "@/server/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public settings the sign-in page needs. */
export function GET() {
  return NextResponse.json({ mail: mailConfigured(), signup: process.env.GOLIVE_SIGNUP === "invite" ? "invite" : "open" });
}
