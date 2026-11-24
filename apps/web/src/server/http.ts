import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asUser, type Tx } from "@golive/db";
import { auth, type AuthUser } from "./auth";
import { db } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const forbidden = (message = "Action non autorisée pour votre rôle.") => new HttpError(403, message, "forbidden");
export const notFound = (message = "Introuvable.") => new HttpError(404, message, "not_found");

export interface Ctx<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  user: AuthUser;
  /** Runs fn under row level security for the current user. */
  as: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

type Handler<P> = (ctx: Ctx<P>) => Promise<unknown>;

/**
 * Authenticated JSON route. Mutations must come from the application itself
 * (Origin check), every database access goes through row level security.
 */
export function route<P = Record<string, string>>(fn: Handler<P>, options: { public?: false } = {}) {
  void options;
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) throw new HttpError(401, "Session expirée. Reconnectez-vous.", "unauthenticated");
      const user = session.user;
      const result = await fn({ req, params: await params, user, as: (f) => asUser(db(), user.id, f) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Route reachable without a session (invitation preview). */
export function publicRoute<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET") assertSameOrigin(req);
      return NextResponse.json(await fn(req, await params), { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof z.ZodError) {
    return NextResponse.json({ error: "Données invalides.", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  console.error("[api]", e);
  return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin, process.env.GOLIVE_URL && new URL(process.env.GOLIVE_URL).origin].filter(Boolean));
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "Origine refusée.", "origin");
}

export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Requête invalide.");
  }
  return schema.parse(raw);
}
