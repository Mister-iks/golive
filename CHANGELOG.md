# Changelog

## 0.2.0 (2026-11-25)

First public release of the repository.

### CLI (`@pcybox/golive`)

- English by default, French with `--lang fr` or `GOLIVE_LANG=fr`. Rule titles, explanations, findings and the report follow.
- `golive --version` shows the package and engine versions.
- `--offline` also skips the public RDAP lookup of the audited site's address.

### Checks

- Sensitive files left public: `.git`, `.env`, SQL dumps, `.htpasswd`, configuration backups, `phpinfo`, `server-status`, `.DS_Store`. Reported only when the content matches, so soft 404 pages raise no false alarm.
- Declared versus observed: a declared CDN the traffic does not go through, a site answering from another country than the declared hosting (RDAP registries), trackers on the site missing from the architecture.
- Full audits in the web app: multi-page crawl with axe-core, broken links, Core Web Vitals, mixed content, trackers before consent, Lighthouse scores.
- Repository scan: database URLs following development conventions (`golive:golive`, `postgres:postgres`) are no longer reported as secrets.

### Self-hosted app

- Accounts, one organization per installation, owner / administrator / member roles, invitations, two-factor authentication, account deletion.
- Encrypted and verified connections to PostgreSQL, daily backups, `/api/health` for monitoring. See [docs/operations.md](docs/operations.md).
- WCAG 2.2 AA: no axe-core violation on any page, light and dark themes, English and French.

## 0.1.0 (2026-11-24)

First npm release of the CLI: architecture rules (layer 1), repository scan (layer 2) and passive site audit (layer 3).
