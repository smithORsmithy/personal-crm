#!/usr/bin/env bash
# Fills the production database with test contacts, using the image that is
# live now. If the database already has contacts, no contacts are added:
# only test contacts that are in no group are put into groups. Contacts
# added or edited by hand are never touched.
# Called by the "Seed test data" workflow over SSH as the deploy user.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

use_environment prod
TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ -z "$TAG" ]; then
  echo "Nothing is deployed yet: deploy the app first" >&2
  exit 1
fi
export APP_IMAGE="$IMAGE_REPO:$TAG"

echo "==> Seed with $TAG"
compose run --rm migrate node scripts/seed.cjs
