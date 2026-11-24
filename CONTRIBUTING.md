# Contributing to GoLive

Thank you for helping. The most valuable contributions are **rules and packs**: each one protects every project that runs GoLive.

## Ground rules

- Be kind and precise. See the [code of conduct](CODE_OF_CONDUCT.md).
- Open an issue before a large change so we can agree on the approach.
- Changes to the GoLive Spec format go through an RFC issue labelled `spec`.

## Setup

```bash
pnpm install
pnpm dev          # web app
pnpm test         # tests
pnpm typecheck
```

Node.js 22+ and pnpm 11+ are required.

## Your first rule

Look for issues labelled `good first rule`, then follow [docs/writing-rules.md](docs/writing-rules.md). A rule pull request contains the rule, its test, and nothing else.

## Commits and sign-off

We use the [Developer Certificate of Origin](https://developercertificate.org/) rather than a CLA. Sign off every commit:

```bash
git commit -s -m "packs: add HSTS preload rule"
```

Commit messages start with the area (`spec`, `engine`, `packs`, `probe`, `cli`, `web`, `docs`, `ci`) and use the imperative mood.

## Licensing of contributions

Contributions to `packages/spec`, `packages/packs-sdk`, `packs` and `apps/cli` are licensed Apache-2.0. Contributions to the rest of the repository are licensed AGPL-3.0.
