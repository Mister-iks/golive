# GoLive Spec v1

`golive.yaml` describes a digital project before it goes live: what it is, who uses it, what data it handles, how it is built and where it is hosted. It lives at the root of the repository, is edited by hand or by the Studio, and is checked in CI.

The format is licensed Apache-2.0 so that any tool, company or administration can adopt it. Changes go through an RFC (open an issue labelled `spec`).

## Top-level keys

| Key | Required | Description |
| --- | --- | --- |
| `spec` | yes | Always `golive/v1`. |
| `project` | yes | Identity and profile of the project. |
| `data` | | Personal and sensitive data categories handled. |
| `features` | | Functional features that trigger requirements. |
| `zones` | | Hosting zones (provider, country, network). |
| `actors` | | People and systems that use the project. |
| `components` | | Building blocks of the architecture. |
| `links` | | Data flows between actors and components. |
| `targets` | | URLs and repository to audit. |
| `profiles` | | Packs to apply. Empty means automatic selection. |
| `evidence` | | Manual proofs, keyed by rule id. |
| `waivers` | | Signed exceptions for blocking rules. |
| `layout` | | Studio positions. Ignored by the engine. |

## `project`

```yaml
project:
  name: Online shop            # required
  type: ecommerce              # showcase | ecommerce | saas | mobile-api | api | public-service | internal-tool | other
  description: Optional text
  countries: [ SN, FR ]        # ISO 3166-1 alpha-2, activates country packs
  languages: [ fr, wo ]
  audience: public             # public | authenticated | internal
  criticality: financial       # standard | financial | health | public-service
```

`criticality` other than `standard`, or `type: public-service`, raises the Go threshold from 70 to 80.

## `data` and `features`

```yaml
data:
  personal: [ identity, contact, location, usage, payment, financial ]
  sensitive: [ health, biometric, minors, religion, political, judicial, national-id ]
features: [ accounts, admin, payment, forms, newsletter, uploads, ai, analytics, email ]
```

## `components`

```yaml
components:
  - id: db                      # unique, letters, digits, - and _
    kind: database              # see list below
    name: Main database         # optional display name
    tech: postgresql@17         # name@version, version drives end-of-life checks
    runtime: nodejs@22          # optional runtime or OS
    exposure: private           # public | private, otherwise inferred
    zone: eu                    # reference to a zone
    hosting: { provider: scaleway, country: FR, region: fr-par }
    notes: Free text
```

Kinds: `frontend`, `mobile`, `backend`, `api`, `database`, `cache`, `queue`, `storage`, `cdn`, `waf`, `load-balancer`, `dns`, `payment`, `email`, `idp`, `ai`, `analytics`, `external`, `monitoring`, `logging`, `backup`, `secrets`.

**Exposure inference.** An explicit `exposure` wins. Otherwise a component is public when an actor (`visitor`, `user`, `admin`, `partner`) links to it directly, or when its zone has `network: public`, or when its kind is public by nature (`frontend`, `api`, `cdn`, `waf`, `load-balancer`, `dns`). Third-party services (`payment`, `email`, `idp`, `ai`, `analytics`, `external`, `mobile`) are "managed" and excluded from exposure checks.

**Hosting country.** `hosting.country`, otherwise the country of the component's zone.

## `actors`

```yaml
actors:
  - { id: customer, kind: user, name: Customers }   # visitor | user | admin | partner | system
```

## `links`

```yaml
links:
  - from: api
    to: db
    protocol: postgres-tls      # see list below, defaults to https
    sensitivity: personal       # public | internal | personal | sensitive
    label: orders
```

Encrypted protocols: `https`, `wss`, `grpcs`, `tls`, `mtls`, `postgres-tls`, `mysql-tls`, `mongodb-tls`, `rediss`, `amqps`, `kafka-tls`, `smtps`, `sftp`, `s3`.
Plaintext protocols: `http`, `ws`, `grpc`, `postgres`, `mysql`, `mongodb`, `redis`, `amqp`, `kafka`, `smtp`, `ftp`.
`internal` means an in-process call with no network.

A plaintext link is a **blocker** when it starts from an actor, carries personal or sensitive data, or crosses providers or countries. Otherwise it is **major**.

## `targets`

```yaml
targets:
  preprod: https://preprod.example.sn
  prod: https://example.sn
  repository: https://github.com/org/project
```

Production and pre-production are audited with opposite indexing expectations: production must be indexable, pre-production must not be.

## `profiles`

```yaml
profiles: [ golive-core, web-security, operations, payment, sn-cdp, eu-gdpr ]
```

Aliases: `owasp-asvs-l1` → `web-security`, `wcag-aa` → `accessibility`, `sn` → `sn-cdp`, `eu`, `fr`, `gdpr`, `rgpd` → `eu-gdpr`.

When empty, GoLive applies the core packs, plus `payment` if the project takes payments, `accessibility` for public services and e-commerce, and every country pack matching `project.countries`.

## `evidence`

Rules that cannot be verified automatically return **proof required**. A named attestation turns them into a pass:

```yaml
evidence:
  ops.backup.restore-tested:
    by: "M. Ndiaye, SRE"
    date: 2026-11-15
    url: https://wiki.example.sn/restore-2026-11
    note: Full restore in 42 minutes
```

An attestation never overrides an automatic failure.

## `waivers`

A waiver covers a failing rule until its expiry date. While every open blocker is waived, the verdict is **Conditional Go**.

```yaml
waivers:
  - rule: core.arch.backup
    reason: Pilot with synthetic data only
    owner: "F. Sow, CIO"
    expires: 2027-01-31
    plan: Off-site backups before real users are onboarded
```

Expired waivers are ignored.

## Determinism

The engine output depends only on: the spec (without `layout`), the pack ids and versions, the reference date (`--as-of`) and the web observation (without timings). The report carries a fingerprint of these inputs.
