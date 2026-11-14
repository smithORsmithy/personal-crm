#!/usr/bin/env bash
# Recreates the test stand's database from the newest production backup, so
# the stand has the production data again. Called by the "Refresh test stand
# DB" workflow over SSH as the deploy user. Touches only the test stand:
# production and its backups are only read.
#
# Steps: find the newest backup -> check that it can be read -> stop the
# stand's app -> drop the database, create it again, load the backup ->
# migrations of the version that runs on the stand (the backup may come from
# an older version) -> start the app -> /health check.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

use_environment staging
require_env_file
take_lock

TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ -z "$TAG" ]; then
  echo "Nothing is deployed on the test stand yet: deploy it first" >&2
  exit 1
fi
export APP_IMAGE="$IMAGE_REPO:$TAG"

# Names start with the time, so the last one by name is the newest
FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' | sort | tail -n 1)"
if [ -z "$FILE" ]; then
  echo "No production backups in $BACKUP_DIR yet" >&2
  exit 1
fi
echo "==> Newest production backup: $(basename "$FILE")"
echo "    $(du -h "$FILE" | cut -f1), saved $(date -u -r "$FILE" '+%Y-%m-%d %H:%M UTC')"

echo "==> Database of the test stand"
compose up -d --wait db

echo "==> Check the backup file"
if ! compose exec -T db pg_restore --list < "$FILE" > /dev/null; then
  echo "$FILE is not a readable database backup. Nothing was changed" >&2
  exit 1
fi

echo "==> Stop the app of the test stand"
compose stop app

echo "==> Recreate the database and load the backup"
if ! load_backup "$FILE"; then
  echo "Loading FAILED, see the error above. The test stand's app is stopped: run the refresh again" >&2
  exit 1
fi

echo "==> Migrations of $TAG"
if ! compose run --rm migrate; then
  echo "Migrations failed: the test stand's app is stopped" >&2
  exit 1
fi

echo "==> Start the app of the test stand"
if ! compose up -d --wait --wait-timeout 120 app; then
  echo "The app did not become healthy" >&2
  compose logs --tail 50 app >&2 || true
  exit 1
fi

echo "==> Check /health"
if ! wait_for_health "$TAG"; then
  exit 1
fi

echo "==> Done: the test stand has the data of $(basename "$FILE")"
