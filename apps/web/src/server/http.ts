import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asUser, type Tx } from "@golive/db";
import { auth, type AuthUser } from "./auth";
import type { Lang } from "@/i18n";
import { db } from "./db";
import { L, langOf, pick, type Msg } from "./i18n";

export { L } from "./i18n";

/** An error returned to the client. Messages are given in English and French with L(en, fr). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public msg: Msg,
    public code?: string,
  ) {
    super(pick(msg, "en"));
  }
}

export const forbidden = (message: Msg = L("Your role does not allow this action.", "Action non autorisée pour votre rôle.")) => new HttpError(403, message, "forbidden");
export const notFound = (message: Msg = L("Not found.", "Introuvable.")) => new HttpError(404, message, "not_found");

export const mfaEnforced = () => process.env.GOLIVE_REQUIRE_MFA !== "0";

/** Administrators and validators act only with two-factor authentication enabled. */
export function requireMfa(user: { twoFactorEnabled?: boolean | null }) {
  if (mfaEnforced() && !user.twoFactorEnabled) {
    throw new HttpError(403, L("Turn on two-factor authentication in My account to do this.", "Activez la double authentification dans Mon compte pour effectuer cette action."), "mfa_required");
  }
}

export interface Ctx<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  user: AuthUser;
  /** Language chosen in the interface: use it for e-mails and texts built on the server. */
  lang: Lang;
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
    const lang = langOf(req);
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) throw new HttpError(401, L("Session expired. Please sign in again.", "Session expirée. Reconnectez-vous."), "unauthenticated");
      const user = session.user;
      const result = await fn({ req, params: await params, user, lang, as: (f) => asUser(db(), user.id, f) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return errorResponse(e, lang);
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
      return errorResponse(e, langOf(req));
    }
  };
}

function errorResponse(e: unknown, lang: Lang) {
  if (e instanceof HttpError) return NextResponse.json({ error: pick(e.msg, lang), code: e.code }, { status: e.status });
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: pick(L("Invalid data.", "Données invalides."), lang), issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  console.error("[api]", e);
  return NextResponse.json({ error: pick(L("Internal error.", "Erreur interne."), lang) }, { status: 500 });
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin, process.env.GOLIVE_URL && new URL(process.env.GOLIVE_URL).origin].filter(Boolean));
  if (!origin || !allowed.has(origin)) throw new HttpError(403, L("Origin refused.", "Origine refusée."), "origin");
}

export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, L("Invalid request.", "Requête invalide."));
  }
  return schema.parse(raw);
}
