"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** JSON call to the application API. A missing session sends the user to the sign-in page. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Serveur injoignable. Vérifiez votre connexion.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`, data.code);
  return data;
}
