#!/usr/bin/env bash
# Deploys one version of the app on the server. Called by CI over SSH as the
# deploy user; CI copies this folder to /srv/crm/deploy first.
#   deploy.sh <image tag = git commit SHA>
#
# Order: database backup -> migrations -> new app -> /health check -> cleanup
# of old images. There is no automatic rollback. If the backup or migrations
# fail, the new version is not started and the old one keeps running. If
# /health fails, the script exits with an error and a person decides what to
# do (see README: rollback, backups and restore).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

TAG="${1:?pass the image tag (commit SHA)}"
export APP_IMAGE="$IMAGE_REPO:$TAG"

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE on the server: create it first (see README)" >&2
  exit 1
fi
# Secrets file: readable by its owner only
if [ "$(stat -c '%a' "$ENV_FILE")" != "600" ]; then
  chmod 600 "$ENV_FILE"
fi

take_lock

PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "==> Deploying $TAG (running now: ${PREVIOUS:-nothing})"

echo "==> Database"
compose up -d --wait db

# Named after the version that runs now: the data fits that version
echo "==> Backup of the database"
if ! backup_db "${PREVIOUS:-none}"; then
  echo "Backup failed: the new version was NOT started, the old one keeps running" >&2
  exit 1
fi
echo "    $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
prune_backups || echo "    could not remove old backups" >&2

echo "==> Pull image"
docker pull --quiet "$APP_IMAGE"

echo "==> Migrations"
if ! compose run --rm migrate; then
  echo "Migrations failed: the new version was NOT started, the old one keeps running" >&2
  exit 1
fi

echo "==> Start the new version"
if ! compose up -d --wait --wait-timeout 120 app; then
  echo "The new version did not become healthy" >&2
  compose logs --tail 50 app >&2 || true
  exit 1
fi

echo "==> Check /health"
if ! wait_for_health "$TAG"; then
  exit 1
fi

echo "$TAG" > "$STATE_FILE"
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ]; then
  echo "$PREVIOUS" > "$STATE_FILE.previous"
fi

echo "==> Cleanup: keep only the current and the previous image"
KEEP_PREVIOUS="$(cat "$STATE_FILE.previous" 2>/dev/null || true)"
docker image ls "$IMAGE_REPO" --format '{{.Tag}}' | while read -r tag; do
  if [ "$tag" != "$TAG" ] && [ "$tag" != "$KEEP_PREVIOUS" ]; then
    if docker image rm "$IMAGE_REPO:$tag" >/dev/null; then
      echo "    removed $tag"
    else
      echo "    could not remove $tag (still in use?)"
    fi
  fi
done
docker image prune --force >/dev/null

echo "==> Done: $TAG is live"
