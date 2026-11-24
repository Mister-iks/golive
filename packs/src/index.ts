import type { Pack } from "@golive/packs-sdk";
import { accessibility } from "./accessibility";
import { core } from "./core";
import { euGdpr } from "./eu-gdpr";
import { operations } from "./operations";
import { payment } from "./payment";
import { snCdp } from "./sn-cdp";
import { webSecurity } from "./web-security";

export { accessibility, core, euGdpr, operations, payment, snCdp, webSecurity };

export const COMMUNITY_PACKS: Pack[] = [core, webSecurity, operations, accessibility, payment, snCdp, euGdpr];

/** Profile names used in golive.yaml that map to a pack id. */
export const PROFILE_ALIASES: Record<string, string> = {
  "owasp-asvs-l1": "web-security",
  "wcag-aa": "accessibility",
  "wcag-2.2-aa": "accessibility",
  sn: "sn-cdp",
  eu: "eu-gdpr",
  fr: "eu-gdpr",
  rgpd: "eu-gdpr",
  gdpr: "eu-gdpr",
  core: "golive-core",
};
