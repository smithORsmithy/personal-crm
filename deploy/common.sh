#!/usr/bin/env bash
# Shared by deploy.sh and restore.sh, not run on its own: paths, the compose
# call, the lock that keeps a deploy and a restore from running at the same
# time, the database backup and the /health check.
# shellcheck disable=SC2034 # the constants are used by the scripts that source this file

BASE="/srv/crm"
IMAGE_REPO="ghcr.io/smithorsmithy/personal-crm"
ENV_FILE="$BASE/.env"
STATE_FILE="$BASE/deployed-version"
BACKUP_DIR="$BASE/backups"
BACKUP_KEEP_DAYS=30
# The same database and user as in compose.yaml
DB_NAME="personal_crm"
DB_USER="crm"

compose() {
  docker compose -p prod -f "$BASE/deploy/compose.yaml" --env-file "$ENV_FILE" "$@"
}

# One deploy or restore at a time: the lock is held until the script exits.
# Busy - exit at once, nothing is touched.
take_lock() {
  exec 9>"$BASE/.lock"
  if ! flock -n 9; then
    echo "Another deploy or restore is running now: try again when it finishes" >&2
    exit 1
  fi
}

# Dumps the database into $BACKUP_DIR and sets BACKUP_FILE to the new file.
#   backup_db <app version> [label]
# Name: <UTC time>_<app version>[_<label>].dump,
#   e.g. 2026-11-07_153000_<commit SHA>.dump
# The database must be running. On failure returns 1 and leaves no file.
backup_db() {
  local version="$1" label="${2:-}"
  local name tmp
  name="$(date -u +%Y-%m-%d_%H%M%S)_${version}${label:+_$label}.dump"
  tmp="$BACKUP_DIR/.$name.part"
  BACKUP_FILE=""

  # Backups hold personal data: readable by the owner only
  install -d -m 700 "$BACKUP_DIR" || return 1
  install -m 600 /dev/null "$tmp" || return 1

  if ! compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$tmp"; then
    rm -f "$tmp"
    echo "Could not dump the database" >&2
    return 1
  fi
  # A file that cannot be read back is not a backup
  if ! compose exec -T db pg_restore --list < "$tmp" > /dev/null; then
    rm -f "$tmp"
    echo "The dump cannot be read back" >&2
    return 1
  fi
  mv "$tmp" "$BACKUP_DIR/$name" || return 1
  BACKUP_FILE="$BACKUP_DIR/$name"
}

# Removes backups older than $BACKUP_KEEP_DAYS days and leftovers of
# interrupted backups. Run right after a new backup, so the newest one stays.
prune_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' \
    -mmin +$((BACKUP_KEEP_DAYS * 24 * 60)) -printf '    removed old backup %f\n' -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '.*.part' -delete
}

# Waits until the app answers /health with 200 and the given version.
#   wait_for_health <app version>
wait_for_health() {
  local version="$1" body
  for _ in $(seq 1 10); do
    body="$(curl -fsS --max-time 5 http://127.0.0.1:3000/health || true)"
    if printf '%s' "$body" | grep -q "\"version\":\"$version\""; then
      echo "    /health: $body"
      return 0
    fi
    sleep 3
  done
  echo "/health did not answer 200 with version $version" >&2
  compose logs --tail 50 app >&2 || true
  return 1
}
