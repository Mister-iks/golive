import type { LighthouseResult } from "@golive/packs-sdk";

/**
 * Runs Lighthouse on one page through an already running Chromium (remote debugging port),
 * so it uses the same guarded proxy as the crawl. Never throws.
 */
export async function runLighthouse(url: string, port: number, userAgentToken: string, timeoutMs = 90_000): Promise<LighthouseResult> {
  const started = Date.now();
  try {
    const { default: lighthouse } = await import("lighthouse");
    const run = lighthouse(
      url,
      { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"], maxWaitForLoad: 45_000 },
      {
        extends: "lighthouse:default",
        settings: {
          // Lighthouse's standard mobile profile, with the robot's name appended so site owners can identify it.
          emulatedUserAgent: `Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 ${userAgentToken}`,
        },
      },
    );
    const result = await Promise.race([run, new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error("Lighthouse timed out.")), timeoutMs))]);
    const lhr = result?.lhr;
    if (!lhr) return { url, error: "Lighthouse returned no result.", durationMs: Date.now() - started };
    const score = (id: string) => {
      const s = lhr.categories[id]?.score;
      return typeof s === "number" ? Math.round(s * 100) : null;
    };
    const metric = (id: string) => {
      const v = lhr.audits[id]?.numericValue;
      return typeof v === "number" ? Math.round(v * (id === "cumulative-layout-shift" ? 1000 : 1)) / (id === "cumulative-layout-shift" ? 1000 : 1) : undefined;
    };
    return {
      url: lhr.finalDisplayedUrl ?? url,
      version: lhr.lighthouseVersion,
      formFactor: lhr.configSettings.formFactor,
      scores: { performance: score("performance"), accessibility: score("accessibility"), bestPractices: score("best-practices"), seo: score("seo") },
      metrics: {
        fcpMs: metric("first-contentful-paint"),
        lcpMs: metric("largest-contentful-paint"),
        tbtMs: metric("total-blocking-time"),
        cls: metric("cumulative-layout-shift"),
        speedIndexMs: metric("speed-index"),
      },
      runtimeError: lhr.runtimeError?.message,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return { url, error: (e as Error).message.split("\n")[0], durationMs: Date.now() - started };
  }
}
