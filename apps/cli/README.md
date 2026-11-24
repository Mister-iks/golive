# @pcybox/golive

The command line of **PcyBox GoLive**, the open-source go / no-go gate before any production launch.

It checks what you **declare** (your architecture in a `golive.yaml`), what you **code** (secrets, vulnerable dependencies, containers) and what is **online** (TLS, headers, cookies, legal pages), then returns one verdict: **Go**, **Conditional Go** or **No-Go**. The exit code is non-zero on No-Go, so it can gate a CI pipeline.

The verdict is computed by deterministic, sourced rules. No AI decides.

## Usage

Requires Node.js 22 or later.

```bash
npx @pcybox/golive init --template saas-b2b     # writes a golive.yaml to edit
npx @pcybox/golive check --repo .               # architecture + repository scan
npx @pcybox/golive check --repo . --url https://preprod.example.com --env preprod
```

Or install it once:

```bash
npm install --global @pcybox/golive
golive check --repo .
```

## In CI

GitHub Actions:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @pcybox/golive check --repo . --format markdown >> "$GITHUB_STEP_SUMMARY"
```

GitLab CI:

```yaml
golive:
  image: node:22-alpine
  script:
    - npx -y @pcybox/golive check --repo .
```

## Main options of `golive check`

| Option | Effect |
| --- | --- |
| `--repo [path]` | Also scan the repository: committed secrets, vulnerable dependencies (OSV), Dockerfiles and compose files. |
| `--url <url>` / `--env prod\|preprod` | Also run a passive audit of a deployed URL. |
| `--audit` | Audit the target declared in `golive.yaml`. |
| `--offline` | Do not query the online vulnerability database (osv.dev). |
| `--format pretty\|json\|markdown` | Output format. |
| `--fail-on no-go\|conditional\|never` | Which verdict makes the command fail (default: `no-go`). |
| `--as-of <YYYY-MM-DD>` | Reference date, to replay a verdict exactly. |

Run `golive --help` for the full list. The interface text is in French for now.

## Privacy

The repository scan reads files locally and never executes project code. Secret values are never printed or stored, only their location. Only package names and versions are sent to osv.dev, and `--offline` disables that call.

## License

AGPL-3.0-only. Source code, documentation and the self-hosted web application: https://github.com/Mister-iks/golive
