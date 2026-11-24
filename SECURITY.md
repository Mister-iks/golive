# Security policy

A tool that certifies others must hold itself to the same bar. Thank you for helping keep GoLive safe.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting: **Security** tab, then **Report a vulnerability**.

Include what you found, how to reproduce it and the impact you expect. We acknowledge reports within 5 working days and agree on a disclosure date with you.

## Scope

In scope: the web application, the engine, the probe (including SSRF bypasses), the CLI and the community packs (for example a rule that can be fooled into a false Go).

Out of scope: findings that require a compromised host, and reports produced only by automated scanners without a demonstrated impact.

## Supported versions

Only the latest release receives security fixes during the 0.x series.

## The audit robot

The probe only performs passive `GET` requests, refuses private, loopback and link-local addresses (checked again at connection time to defeat DNS rebinding), follows at most 5 redirects, caps response size, and is rate limited in the web app. Self-hosted installs can allow private targets with `GOLIVE_ALLOW_PRIVATE=1`.
