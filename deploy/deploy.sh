#!/usr/bin/env bash
# Deploys one version of the app on the server. Called by CI over SSH as the
# deploy user; CI copies this folder to /srv/crm/deploy first.
#   deploy.sh <image tag = git commit SHA>
#
# Order: migrations -> new app -> /health check -> cleanup of old images.
# There is no automatic rollback. If migrations fail, the new version is not
# started and the old one keeps running. If /health fails, the script exits
# with an error and a person decides what to do (see README: rollback).
set -euo pipefail

TAG="${1:?pass the image tag (commit SHA)}"
BASE="/srv/crm"
IMAGE_REPO="ghcr.io/smithorsmithy/personal-crm"
ENV_FILE="$BASE/.env"
STATE_FILE="$BASE/deployed-version"
export APP_IMAGE="$IMAGE_REPO:$TAG"

compose() {
  docker compose -p prod -f "$BASE/deploy/compose.yaml" --env-file "$ENV_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE on the server: create it first (see README)" >&2
  exit 1
fi
# Secrets file: readable by its owner only
if [ "$(stat -c '%a' "$ENV_FILE")" != "600" ]; then
  chmod 600 "$ENV_FILE"
fi

PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "==> Deploying $TAG (running now: ${PREVIOUS:-nothing})"

echo "==> Pull image"
docker pull --quiet "$APP_IMAGE"

echo "==> Database"
compose up -d --wait db

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
body=""
for attempt in $(seq 1 10); do
  body="$(curl -fsS --max-time 5 http://127.0.0.1:3000/health || true)"
  if printf '%s' "$body" | grep -q "\"version\":\"$TAG\""; then
    echo "    /health: $body"
    break
  fi
  body=""
  sleep 3
done
if [ -z "$body" ]; then
  echo "/health did not answer 200 with version $TAG" >&2
  compose logs --tail 50 app >&2 || true
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
