# Writing a rule

A rule is a small TypeScript object: metadata that explains it, and a pure `check` function that looks at the project and returns findings. Rules live in packs under [`packs/src`](../packs/src). Every rule is written in English and carries its French translation.

## Anatomy

```ts
import { defineRule, fail, pass, tr } from "@golive/packs-sdk";

export const myRule = defineRule({
  id: "core.arch.monitoring",          // stable, never reused once retired
  title: "The service is monitored",
  why: "Without monitoring, your users are the ones who discover outages.",
  layer: 1,                            // 1 architecture · 2 code · 3 online · 4 AI
  category: "operations",              // architecture | security | data | operations | quality | legal
  severity: "major",                   // blocker | major | minor | info, or (ctx) => severity
  method: "auto",                      // auto | evidence | hybrid
  source: { label: "Google SRE Book, Monitoring Distributed Systems", url: "https://sre.google/sre-book/monitoring-distributed-systems/" },
  fix: "Add monitoring with alerts sent to a person.",
  fr: {
    title: "Le service est supervisé",
    why: "Sans supervision, ce sont vos utilisateurs qui découvrent les pannes.",
    fix: "Ajoutez une supervision avec des alertes envoyées à une personne.",
    // source: "…",                   // only when the label differs in French
  },
  applies: (ctx) => ctx.graph.has("backend", "api"),
  check: (ctx) =>
    ctx.graph.has("monitoring")
      ? pass(tr(ctx, "Monitoring declared.", "Supervision déclarée."))
      : fail(tr(ctx, "No monitoring declared.", "Aucune supervision déclarée.")),
});
```

Then add the rule to the `rules` array of its pack. A new pack also gets `fr: { name, description }` and is registered in [`packs/src/index.ts`](../packs/src/index.ts).

## Languages

PcyBox GoLive is English by default with a complete French version. The engine picks the texts for the language asked (`evaluate(spec, { lang: "fr" })`, the EN / FR switch in the app, `--lang fr` in the CLI).

- `title`, `why`, `fix` and `source.label` are English; their French versions go in `fr`.
- Every finding message goes through `tr(ctx, "English", "Français")`. Interpolate values in both: `tr(ctx, \`${n} pages\`, \`${n} pages\`)`.
- Component kinds, actors and countries in a message come from the catalogue in the right language: `catalog(ctx.lang).KINDS[kind].label` (from `@golive/spec`).
- `na()`, `notRun()` and `notScanned()` without a message are translated by the engine.
- The language never changes the outcome: same status, severity, score and fingerprint. A test checks that every community rule has its French texts.
- Write plainly. No long dashes (use commas, colons or parentheses). The product name is always "PcyBox GoLive".

## The context

| Field | What it gives you |
| --- | --- |
| `ctx.spec` | The validated `golive.yaml`. |
| `ctx.graph` | Helpers: `ofKind`, `has`, `linksFrom`, `linksTo`, `linked`, `exposure`, `country`, `provider`, `label`. |
| `ctx.repo` | Layer 2 observation (secrets, dependencies, containers), when the repository was scanned. Use `withRepo(ctx, fn)`. |
| `ctx.web` | Layer 3 observation (headers, TLS, cookies, HTML summary, exposed files, edge network, RDAP), when an audit ran. Use `withWeb(ctx, fn)`. |
| `ctx.web.crawl` | Multi-page browser crawl of a full audit (pages, axe-core, vitals, Lighthouse, trackers). Use `withCrawl(ctx, fn)`. |
| `ctx.asOf` | Reference date. Use it instead of `new Date()` so results stay reproducible. |
| `ctx.lang` | Language of the messages, for `tr()` and `catalog()`. |

Helpers from the SDK: `hasFeature`, `targetsCountry`, `handlesPersonalData`, `handlesSensitiveData`, `isCritical`, `dataStores`. Helpers from [`packs/src/util.ts`](../packs/src/util.ts): `withWeb`, `withCrawl`, `withRepo`, `findLink`, `detectTrackers`, `plural`, `pathOf`, `list`.

## Findings

Return one finding or an array: `pass`, `warn`, `fail`, `evidence` (proof required), `na`, `notRun`. Attach `target` (a component id, actor id or `from->to` link id) so the Studio can show the finding on the diagram, and `observed` for the raw value you saw. A finding may override the rule severity with `severity`.

## Rules of the house

1. **Deterministic.** No network, no clock, no randomness inside `check`.
2. **Sourced.** Every rule cites a law article, standard or recognised guide. No source, no rule.
3. **Actionable.** `fix` says what to do, in plain words, in one or two sentences.
4. **Passive.** Layer 3 rules only read what the probe and the robot observed. PcyBox GoLive never attacks a site.
5. **Legal humility.** Legal rules set `legal: true`. PcyBox GoLive flags and cites, it does not give legal advice.
6. **Bilingual.** English in the rule, French in `fr` and in every `tr()`.
7. **Tested.** Add a case to [`packages/engine/test/engine.test.ts`](../packages/engine/test/engine.test.ts) that makes the rule fail and pass.

## Testing your rule

```bash
pnpm install
pnpm --filter @golive/engine test     # engine and rules
pnpm typecheck                        # every package
```

A test usually loads a template, changes what the rule looks at, and reads the result:

```ts
const spec = load("saas-b2b");
const withoutMonitoring = { ...spec, components: spec.components.filter((c) => c.kind !== "monitoring") };
const r = evaluate(withoutMonitoring, { asOf: AS_OF }).results.find((x) => x.ruleId === "core.arch.monitoring")!;
expect(r.status).toBe("fail");
```

For rules that read an audit, pass a `web` observation (see the `layer 3` and `exposed files` tests for complete examples).

## Adding a country pack

Copy [`packs/src/sn-cdp.ts`](../packs/src/sn-cdp.ts), set `countries`, register the pack in [`packs/src/index.ts`](../packs/src/index.ts), and open a pull request. Legal packs need a review by a practitioner of that country before they lose the "review pending" flag: set `reviewedAt` and `reviewer` once done.
