"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient(), twoFactorClient()] });

/** Only same-site paths are accepted as a destination after sign-in. */
export function safeNext(raw: string | null | undefined, fallback = "/") {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
