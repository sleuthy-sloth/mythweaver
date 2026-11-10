#!/usr/bin/env sh
# Mythweaver backup: a full, custom-format pg_dump of the compose database.
#
# Run from the repository root (the directory containing compose.yaml), by hand or by cron:
#
#   15 4 * * *  cd /home/spkoehl/repos/mythweaver && infra/backup.sh >> /var/log/mythweaver-backup.log 2>&1
#
# The dump is self-checked before the script reports success: pg_restore --list must be able
# to read it. A backup that has never been read back is a hope, not a backup.
#
# Environment:
#   MYTHWEAVER_BACKUP_DIR   where dumps land   (default: ~/backups/mythweaver)
#   MYTHWEAVER_KEEP         how many to keep   (default: 14)
#   COMPOSE_FILE            passed through,    (default: the repo root compose.yaml)

set -eu

# Dumps contain password hashes and every campaign; nothing here should be group- or
# world-readable, however trusted the host.
umask 077

repo_dir=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo_dir"

backup_dir=${MYTHWEAVER_BACKUP_DIR:-"$HOME/backups/mythweaver"}
keep=${MYTHWEAVER_KEEP:-14}
mkdir -p "$backup_dir"

stamp=$(date +%Y%m%d-%H%M%S)
dump="$backup_dir/mythweaver-$stamp.dump"

# -T (no TTY) keeps this scriptable; the role and database are read from the db container's own
# environment (compose resolves .env), so the password never appears in this script, the command
# line, or the backup log. No --file flag: this image's pg_dump treats "-" as a literal filename,
# so stdout (the default) is the only honest stream.
db_user=$(docker compose exec -T db printenv POSTGRES_USER)
db_name=$(docker compose exec -T db printenv POSTGRES_DB)
docker compose exec -T db pg_dump --username="$db_user" --format=custom "$db_name" >"$dump"

# Self-check: pg_restore must be able to read the archive, and the campaign table — the one
# table whose loss ends the world — must appear in its catalog. No positional argument: this
# image's pg_restore treats "-" as a literal filename too, so stdin (the default) it is.
docker compose exec -T db pg_restore --list <"$dump" | grep -q 'TABLE public campaigns' \
  || { echo "backup self-check failed: unreadable or campaigns missing in $dump" >&2; rm -f "$dump"; exit 1; }

sha256sum "$dump" >"$dump.sha256"
size=$(du -h "$dump" | cut -f1)

# Retention: newest N dumps survive, everything older goes.
ls -1t "$backup_dir"/mythweaver-*.dump 2>/dev/null | tail -n +$((keep + 1)) | while read -r old; do
  rm -f "$old" "$old.sha256"
done

echo "backup ok: $dump ($size, sha256 $(cut -d' ' -f1 "$dump.sha256"))"
