# Running PcyBox GoLive in production

This guide covers the reference installation (`docker-compose.yml`): one Docker host running PostgreSQL, the web app, the audit worker and a backup job.

## Encrypted database connections

The `tls` service creates, on first start, a certificate for PostgreSQL (`CN=db`, valid 10 years) in the `pgtls` volume. PostgreSQL only serves it; the web app, the worker, the migrations and the backup job connect with TLS and verify it (`DATABASE_SSL_CA=/tls/server.crt`, `PGSSLMODE=verify-full`). The private key never leaves the database container.

Outside Docker, set `DATABASE_SSL=require` to encrypt, or `DATABASE_SSL_CA=/path/to/ca.crt` to encrypt and verify the server certificate and host name.

To renew the certificate, remove it and restart:

```bash
docker compose run --rm --entrypoint sh tls -c "rm -f /tls/server.key /tls/server.crt"
docker compose up -d --force-recreate
```

## Backups

The `backup` service writes a compressed dump of the database every day in `./backups` (or `GOLIVE_BACKUP_DIR`) and keeps 14 days (`GOLIVE_BACKUP_KEEP_DAYS`). Change the frequency with `GOLIVE_BACKUP_EVERY_SECONDS`.

**A backup on the same disk does not survive a disk failure or a ransomware attack.** Copy `./backups` to another machine or an object storage every day, for example with `rclone`, `restic` or your provider's snapshot feature.

Take a backup now:

```bash
docker compose run --rm --entrypoint pg_dump backup --format=custom --file=/backups/manual.dump
```

### Restore

Test a restore regularly: a backup that was never restored is a hope, not a backup.

```bash
docker compose stop web worker
docker compose run --rm --entrypoint pg_restore backup --clean --if-exists --no-owner --dbname=golive /backups/golive-YYYYMMDD-HHMMSS.dump
docker compose start web worker
```

To rehearse without touching production, restore into a scratch database instead:

```bash
docker compose exec db createdb -U golive golive_restore_test
docker compose run --rm -e PGDATABASE=golive_restore_test --entrypoint pg_restore backup --no-owner --dbname=golive_restore_test /backups/golive-YYYYMMDD-HHMMSS.dump
docker compose exec db psql -U golive -d golive_restore_test -c "select count(*) from projects"
docker compose exec db dropdb -U golive golive_restore_test
```

Then attest it in your project's `golive.yaml` (rule `ops.backup.restore-tested`).

## Monitoring

`GET /api/health` answers:

- `200 {"status":"ok","database":true,"worker":true}` when the database answers and an audit worker was seen in the last two minutes,
- `503` with `"status":"degraded"` otherwise.

It is public and reveals no data. Point any uptime monitor at it (Uptime Kuma, Better Stack, a load balancer health check, Prometheus blackbox exporter) and send the alerts to a person, not only to a mailbox nobody reads.

The containers also log to standard output: `docker compose logs -f web worker`. Ship them to your log platform if you have one.

## Accounts and data

- The first account created owns the organization; others join by invitation (valid 7 days).
- Owners and administrators must enable two-factor authentication before managing the team or signing waivers (`GOLIVE_REQUIRE_MFA=0` turns this off, for single-person installs only).
- People delete their own account from **My account**. Owners first hand over ownership. Their entries in the activity log stay, without the link to them.

## Upgrades

```bash
git pull
docker compose up -d --build
```

The `migrate` service applies database migrations before the web app and the worker start. Take a backup first.
