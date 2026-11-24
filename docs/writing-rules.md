# Writing a rule

A rule is a small TypeScript object: metadata that explains it, and a pure `check` function that looks at the project and returns findings. Rules live in packs under [`packs/src`](../packs/src).

## Anatomy

```ts
import { defineRule, fail, pass } from "@golive/packs-sdk";

export const myRule = defineRule({
  id: "core.arch.monitoring",          // stable, never reused once retired
  title: "Le service est supervisé",
  why: "Sans supervision, ce sont vos utilisateurs qui découvrent les pannes.",
  layer: 1,                            // 1 architecture · 2 code · 3 online · 4 AI
  category: "operations",              // architecture | security | data | operations | quality | legal
  severity: "major",                   // blocker | major | minor | info, or (ctx) => severity
  method: "auto",                      // auto | evidence | hybrid
  source: { label: "Google SRE Book", url: "https://sre.google/sre-book/monitoring-distributed-systems/" },
  fix: "Ajoutez une supervision avec des alertes envoyées à une personne.",
  applies: (ctx) => ctx.graph.has("backend", "api"),
  check: (ctx) =>
    ctx.graph.has("monitoring") ? pass("Supervision déclarée.") : fail("Aucune supervision déclarée."),
});
```

## The context

| Field | What it gives you |
| --- | --- |
| `ctx.spec` | The validated `golive.yaml`. |
| `ctx.graph` | Helpers: `ofKind`, `has`, `linksFrom`, `linksTo`, `linked`, `exposure`, `country`, `provider`, `label`. |
| `ctx.web` | Layer 3 observation (headers, TLS, cookies, HTML summary), when an audit ran. |
| `ctx.asOf` | Reference date. Use it instead of `new Date()` so results stay reproducible. |

Helpers from the SDK: `hasFeature`, `targetsCountry`, `handlesPersonalData`, `handlesSensitiveData`, `isCritical`, `dataStores`.

## Findings

Return one finding or an array: `pass`, `warn`, `fail`, `evidence` (proof required), `na`, `notRun`. Attach `target` (a component id, actor id or `from->to` link id) so the Studio can show the finding on the diagram, and `observed` for the raw value you saw. A finding may override the rule severity with `severity`.

## Rules of the house

1. **Deterministic.** No network, no clock, no randomness inside `check`.
2. **Sourced.** Every rule cites a law article, standard or recognised guide. No source, no rule.
3. **Actionable.** `fix` says what to do, in plain words, in one or two sentences.
4. **Passive.** Layer 3 rules only read what the probe observed. GoLive never attacks a site.
5. **Legal humility.** Legal rules set `legal: true`. GoLive flags and cites, it does not give legal advice.
6. **Tested.** Add a case to [`packages/engine/test`](../packages/engine/test) that makes the rule fail and pass.

## Adding a country pack

Copy [`packs/src/sn-cdp.ts`](../packs/src/sn-cdp.ts), set `countries`, register the pack in [`packs/src/index.ts`](../packs/src/index.ts), and open a pull request. Legal packs need a review by a practitioner of that country before they lose the "review pending" flag: set `reviewedAt` and `reviewer` once done.
