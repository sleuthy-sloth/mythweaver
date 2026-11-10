# Backups and restore

Campaign data lives in exactly one place — the Postgres volume — so one dump protects
everything: accounts, campaigns, characters, rolls, the journal, world entities, and the map
images stored as `bytea`. There is no file tree to back up separately.

## Taking a backup

```bash
pnpm db:backup          # or: infra/backup.sh from the repo root
```

The script runs `pg_dump --format=custom` inside the `db` container and writes to
`~/backups/mythweaver/mythweaver-YYYYmmdd-HHMMSS.dump` (override with
`MYTHWEAVER_BACKUP_DIR`). Every dump gets a `.sha256` sidecar, and the script refuses to
report success until `pg_restore --list` can read the archive back and finds the `campaigns`
table in its catalog. A backup that has never been read is a hope, not a backup.

The last 14 dumps are kept (override with `MYTHWEAVER_KEEP`); older files and their checksums
are deleted. Dumps contain password hashes and all campaign data, so the script sets `umask
077` and the files are owner-only.

Unattended, from cron:

```cron
15 4 * * *  cd /home/spkoehl/repos/mythweaver && infra/backup.sh >> /var/log/mythweaver-backup.log 2>&1
```

## Restoring

Custom-format archives restore only into an **empty** database — restore first, then let the
stack's own migration gate confirm the schema. For a lost volume (or a new host):

```bash
docker compose up -d db                                   # fresh volume, empty cluster
docker compose exec -T db pg_restore --username=mythweaver \
    --no-owner --dbname="$POSTGRES_DB" < ~/backups/mythweaver/mythweaver-YYYYmmdd-HHMMSS.dump
docker compose up --build                                 # migrate re-runs as a no-op; api starts
```

The restore preserves the `drizzle.__drizzle_migrations` table, so `migrate` finds nothing
pending and exits 0 — the same gate it must pass on any normal boot. Verify before trusting:

```bash
docker compose exec -T db psql -U mythweaver -d mythweaver -At -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
```

and compare the counts to what you expect — or to the next backup you take.

## What the drill proved (2026-11-10, this host)

A full rehearsal, without touching the live volume:

1. `infra/backup.sh` dumped the live db (45,661 bytes) and passed its self-check.
2. The archive was restored into a scratch database (`drill_restore`) on the same cluster.
3. Every fingerprint matched the live db: all 14 table row counts, the map image's `md5`
   (`995d213f…` — the `bytea` survived), and the 6 applied migrations.
4. The real `migrate` container was pointed at the restored database and exited 0 without
   applying anything (still 6 migrations — no double-apply).

This proves the backup is restorable and that a restored database passes the stack's own boot
gate. It does not prove cross-host restore (same cluster, same major version), and it does not
exercise `docker compose down -v` against the live volume — that step destroys data and was
deliberately rehearsed with the scratch database instead.

## Known limits

- **No point-in-time recovery.** This is snapshot-based: restore to the moment of a dump, and
  the recovery point objective is the cron cadence. WAL archiving would close that gap and is
  not worth it for a single-user install.
- **No off-host copy.** Dumps live (and die) with the host. Copy `~/backups/mythweaver` to
  another machine or object storage if the host itself is the failure you are insuring against.
- **No restore of individual rows.** The unit of recovery is the whole database. To pull one
  campaign out of a dump, restore into a scratch database and use the export feature.
