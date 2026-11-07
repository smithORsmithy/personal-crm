#!/usr/bin/env bash
# Restores the production database from a backup file. Run by a person on
# the server, never by CI (see README: backups and restore):
#   ssh -t crm
#   sudo -u deploy-app /srv/crm/deploy/restore.sh <backup file>
# Without a file it only lists the backups.
#
# Steps: show what will be replaced and wait for "yes" -> save a copy of the
# current database -> stop the app -> drop the database, create it again,
# load the backup -> start the same app container again (the app version does
# not change) -> /health check. Nothing is rolled back automatically: if
# loading fails, the app stays stopped and the script prints how to bring
# back the copy saved before the restore.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

DEPLOY_USER="deploy-app"
SELF="$BASE/deploy/restore.sh"

list_backups() {
  local files
  shopt -s nullglob
  files=("$BACKUP_DIR"/*.dump)
  shopt -u nullglob
  echo "Backups in $BACKUP_DIR, newest first:"
  if [ ${#files[@]} -eq 0 ]; then
    echo "  (none)"
    return
  fi
  # Names start with the time, so sorting by name sorts by time
  printf '%s\n' "${files[@]}" | sort -r | while read -r f; do
    printf '  %6s  %s\n' "$(du -h "$f" | cut -f1)" "$(basename "$f")"
  done
}

if [ "$(id -un)" != "$DEPLOY_USER" ]; then
  echo "Run it as $DEPLOY_USER:" >&2
  echo "  sudo -u $DEPLOY_USER $SELF ${1:-}" >&2
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "Usage: sudo -u $DEPLOY_USER $SELF <backup file>"
  echo
  list_backups
  exit 1
fi

# A bare file name means a file in the backups folder
FILE="$1"
if [ ! -f "$FILE" ] && [ -f "$BACKUP_DIR/$FILE" ]; then
  FILE="$BACKUP_DIR/$FILE"
fi
if [ ! -f "$FILE" ]; then
  echo "No such file: $1" >&2
  echo >&2
  list_backups >&2
  exit 1
fi
FILE="$(realpath "$FILE")"

if [ ! -t 0 ]; then
  echo "The script asks for confirmation: log in with 'ssh -t crm' and run it there" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE on the server" >&2
  exit 1
fi

take_lock

# The app container that exists now. It is stopped and started again as is,
# so the app version stays the same.
APP_CONTAINER="$(docker ps -aq \
  --filter label=com.docker.compose.project=prod \
  --filter label=com.docker.compose.service=app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "The app is not deployed: deploy it first, then restore" >&2
  exit 1
fi
if [ "$(printf '%s\n' "$APP_CONTAINER" | wc -l)" -ne 1 ]; then
  echo "More than one app container in project prod, expected one:" >&2
  docker ps -a --filter label=com.docker.compose.project=prod >&2
  exit 1
fi
APP_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER")"
export APP_IMAGE
VERSION="${APP_IMAGE##*:}"

compose up -d --wait db
DB_CONTAINER="$(compose ps --format '{{.Name}}' db)"

echo "==> Check the backup file"
if ! compose exec -T db pg_restore --list < "$FILE" > /dev/null; then
  echo "$FILE is not a readable database backup. Nothing was changed" >&2
  exit 1
fi

# Name: <date>_<time>_<app version>[_<label>].dump
BACKUP_VERSION="$(basename "$FILE" .dump | cut -d_ -f3)"
if ! printf '%s' "$BACKUP_VERSION" | grep -Eq '^([0-9a-f]{40}|none)$'; then
  BACKUP_VERSION="unknown"
fi

cat <<EOF

Restore the production database from a backup
  Backup file:        $FILE
                      $(du -h "$FILE" | cut -f1), saved $(date -u -r "$FILE" '+%Y-%m-%d %H:%M UTC')
  Made with app:      $BACKUP_VERSION
  Database replaced:  $DB_NAME in container $DB_CONTAINER
  App version now:    $VERSION (stays the same)
EOF
if [ "$BACKUP_VERSION" != "$VERSION" ] && [ "$BACKUP_VERSION" != "none" ]; then
  cat <<EOF

  WARNING: the backup was made with another app version than the one running.
  Usually you first roll the app back to the version from the backup name
  (README: rollback), then restore.
EOF
fi
cat <<EOF

Everything in $DB_NAME will be deleted and replaced with this backup.
A copy of the current database is saved first.
EOF
read -r -p "Type yes to continue: " answer || answer=""
if [ "$answer" != "yes" ]; then
  echo "Cancelled. Nothing was changed"
  exit 1
fi

echo "==> Save a copy of the current database"
if ! backup_db "$VERSION" "before-restore"; then
  echo "Could not save a copy of the current database. Nothing was changed" >&2
  exit 1
fi
COPY="$BACKUP_FILE"
echo "    $COPY ($(du -h "$COPY" | cut -f1))"

echo "==> Stop the app"
compose stop app

echo "==> Recreate the database and load the backup"
# One transaction: if loading fails, the new database stays empty rather
# than half-filled
if ! compose exec -T db dropdb -U "$DB_USER" --if-exists --force "$DB_NAME" ||
  ! compose exec -T db createdb -U "$DB_USER" -O "$DB_USER" "$DB_NAME" ||
  ! compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" \
    --single-transaction --exit-on-error --no-owner < "$FILE"; then
  cat >&2 <<EOF

Restore FAILED, see the error above.
The app is stopped: the site shows the placeholder page.
The database as it was before the restore is saved in
  $COPY
To bring it back:
  sudo -u $DEPLOY_USER $SELF $COPY
EOF
  exit 1
fi

echo "==> Start the app (same version: $VERSION)"
if ! compose start app; then
  echo "The database is restored, but the app did not start" >&2
  exit 1
fi

echo "==> Check /health"
if ! wait_for_health "$VERSION"; then
  echo "The database is restored, but the app does not answer /health" >&2
  exit 1
fi

echo "==> Done: $DB_NAME restored from $FILE, app version $VERSION"
