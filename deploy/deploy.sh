#!/usr/bin/env bash
# Deploys one version of the app to one environment on the server: the test
# stand or production. Called by CI over SSH as the deploy user; CI copies
# this folder to /srv/crm/deploy first.
#   deploy.sh <prod|staging> <image tag = git commit SHA>
# The GHCR login comes on stdin, in case the image has to be pulled (see
# read_registry_login in common.sh).
#
# Order: database backup (production only) -> migrations -> new app ->
# /health check -> cleanup of old images (after production only). There is
# no automatic rollback. If the backup or migrations fail, the new version is
# not started and the old one keeps running. If /health fails, the script
# exits with an error and a person decides what to do (see README: rollback,
# backups and restore).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

read_registry_login
exec </dev/null

use_environment "${1:?pass the environment: prod or staging}"
TAG="${2:?pass the image tag (commit SHA)}"
export APP_IMAGE="$IMAGE_REPO:$TAG"

require_env_file
take_lock

PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "==> Deploying $TAG to $ENVIRONMENT (running now: ${PREVIOUS:-nothing})"

echo "==> Database"
compose up -d --wait db

if [ "$ENVIRONMENT" = "prod" ]; then
  # Named after the version that runs now: the data fits that version
  echo "==> Backup of the database"
  if ! backup_db "${PREVIOUS:-none}"; then
    echo "Backup failed: the new version was NOT started, the old one keeps running" >&2
    exit 1
  fi
  echo "    $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  prune_backups || echo "    could not remove old backups" >&2
fi

echo "==> Image"
if ! ensure_image; then
  echo "Could not get $APP_IMAGE: the new version was NOT started, the old one keeps running" >&2
  exit 1
fi

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

if [ "$ENVIRONMENT" = "prod" ]; then
  echo "==> Cleanup: images older than $IMAGE_KEEP_DAYS days, except the two last production versions and the test stand's"
  cleanup_images || echo "    could not clean up old images" >&2
fi

echo "==> Done: $TAG is live on $ENVIRONMENT"
