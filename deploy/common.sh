#!/usr/bin/env bash
# Shared by the scripts in this folder, not run on its own: the environment
# (production or the test stand), paths, the compose call, the lock that
# keeps two deploys or a deploy and a restore of one environment from running
# at the same time, pulling the image, the database backup, the /health
# check and the cleanup of old images.
# shellcheck disable=SC2034 # the constants are used by the scripts that source this file

BASE="/srv/crm"
IMAGE_REPO="ghcr.io/smithorsmithy/personal-crm"
# Backups are made of the production database only: before each production
# deploy and daily (backup.sh). The test stand loads the newest of them
# (refresh-staging.sh).
BACKUP_DIR="$BASE/backups"
# How many backups of each kind (before a deploy, daily) are kept
BACKUP_KEEP=7
# The same database and user as in compose.yaml
DB_NAME="personal_crm"
DB_USER="crm"
# Images on the server older than this are removed after a production
# deploy, except the ones that can still be needed (see cleanup_images)
IMAGE_KEEP_DAYS=14

# Picks the environment for everything below. Call it first.
#   use_environment prod|staging
use_environment() {
  ENVIRONMENT="$1"
  case "$ENVIRONMENT" in
    prod)
      # Production keeps the paths it had before the test stand appeared
      ENV_DIR="$BASE"
      APP_URL="https://app.linkbook.site"
      APP_PORT=3000
      # shellcheck disable=SC2089 # the quotes belong to the value: "name" <address>
      MAIL_FROM='"Личная CRM" <noreply@mail.crm.linkbook.site>'
      # 0 = no limit, as before the test stand
      APP_MEMORY_LIMIT=0
      DB_MEMORY_LIMIT=0
      ;;
    staging)
      ENV_DIR="$BASE/staging"
      APP_URL="https://test-app.linkbook.site"
      APP_PORT=3001
      # shellcheck disable=SC2089 # the quotes belong to the value
      MAIL_FROM='"Личная CRM (тест)" <noreply@mail.crm.linkbook.site>'
      # The test stand shares the small server with production: it must
      # not take the memory production needs
      APP_MEMORY_LIMIT=512m
      DB_MEMORY_LIMIT=256m
      ;;
    *)
      echo "Unknown environment '$ENVIRONMENT': expected prod or staging" >&2
      exit 1
      ;;
  esac
  ENV_FILE="$ENV_DIR/.env"
  # The version that runs now; deploy.sh keeps the one before it in
  # $STATE_FILE.previous
  STATE_FILE="$ENV_DIR/deployed-version"
  LOCK_FILE="$ENV_DIR/.lock"
  # Read by compose.yaml
  # shellcheck disable=SC2090 # MAIL_FROM keeps its quotes on purpose
  export APP_URL APP_PORT MAIL_FROM APP_MEMORY_LIMIT DB_MEMORY_LIMIT
}

compose() {
  docker compose -p "$ENVIRONMENT" -f "$BASE/deploy/compose.yaml" --env-file "$ENV_FILE" "$@"
}

# Stops with a message if the environment has no .env yet; keeps the file
# readable by its owner only.
require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "No $ENV_FILE on the server: create it first (see README)" >&2
    exit 1
  fi
  if [ "$(stat -c '%a' "$ENV_FILE")" != "600" ]; then
    chmod 600 "$ENV_FILE"
  fi
}

# One deploy, restore, backup or refresh per environment at a time: the lock
# is held until the script exits. Busy - exit at once (or after waiting the
# given number of seconds), nothing is touched.
#   take_lock [seconds to wait]
take_lock() {
  local wait="${1:-0}"
  exec 9>"$LOCK_FILE"
  if [ "$wait" -gt 0 ]; then
    flock -w "$wait" 9 && return 0
  else
    flock -n 9 && return 0
  fi
  echo "Another deploy or restore of $ENVIRONMENT is running now: try again when it finishes" >&2
  exit 1
}

# The GHCR login for pulling an image comes from CI on stdin: the user on
# the first line, the token on the second. Read it before anything else can
# eat stdin (docker compose exec forwards stdin to the container).
read_registry_login() {
  REGISTRY_USER=""
  REGISTRY_TOKEN=""
  if [ ! -t 0 ]; then
    IFS= read -r REGISTRY_USER || true
    IFS= read -r REGISTRY_TOKEN || true
  fi
}

# Makes sure $APP_IMAGE is on the server: pulls it only when it is missing,
# so a rollback works even if GHCR no longer has the image. The login lives
# in a temporary docker config for this one pull: deploys of the test stand
# and production running at the same time never share or end each other's
# login.
ensure_image() {
  local config status=0
  if docker image inspect "$APP_IMAGE" >/dev/null 2>&1; then
    echo "    $APP_IMAGE is on the server already"
    return 0
  fi
  config="$(mktemp -d)"
  if [ -n "$REGISTRY_TOKEN" ]; then
    printf '%s' "$REGISTRY_TOKEN" |
      DOCKER_CONFIG="$config" docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null ||
      status=$?
  fi
  if [ "$status" -eq 0 ]; then
    DOCKER_CONFIG="$config" docker pull --quiet "$APP_IMAGE" || status=$?
  fi
  rm -rf "$config"
  return "$status"
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

# Keeps the $BACKUP_KEEP newest backups of each kind - made before a deploy
# (<time>_<version>.dump) and daily (<time>_<version>_daily.dump) - and
# removes leftovers of interrupted backups. Copies saved before a restore
# are never removed. Run right after a new backup, so the newest one stays.
prune_backups() {
  local kind name
  for kind in "" "_daily"; do
    # Names start with the time, so sorting by name sorts by time
    find "$BACKUP_DIR" -maxdepth 1 -type f -regextype posix-extended \
      -regex ".*/[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}_([0-9a-f]{40}|none)$kind\.dump" \
      -printf '%f\n' | sort -r | tail -n +$((BACKUP_KEEP + 1)) | while read -r name; do
      rm -f "$BACKUP_DIR/$name" && echo "    removed old backup $name"
    done
  done
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '.*.part' -delete
}

# Replaces the whole database with a backup file: drop it, create it again,
# load the file. The app must be stopped. One transaction: if loading fails,
# the new database stays empty rather than half-filled. Returns 1 on failure.
#   load_backup <file>
load_backup() {
  local file="$1"
  compose exec -T db dropdb -U "$DB_USER" --if-exists --force "$DB_NAME" &&
    compose exec -T db createdb -U "$DB_USER" -O "$DB_USER" "$DB_NAME" &&
    compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" \
      --single-transaction --exit-on-error --no-owner < "$file"
}

# Waits until the app answers /health with 200 and the given version.
#   wait_for_health <app version>
wait_for_health() {
  local version="$1" body
  for _ in $(seq 1 10); do
    body="$(curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/health" || true)"
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

# Removes app images older than $IMAGE_KEEP_DAYS days, except the two last
# production versions (the current one and the one to roll back to) and the
# version on the test stand. An image that a container still uses is not
# removed. Younger images stay: one may be in the middle of a deploy.
cleanup_images() {
  local keep=() limit tag created created_at
  keep+=("$(cat "$BASE/deployed-version" 2>/dev/null || true)")
  keep+=("$(cat "$BASE/deployed-version.previous" 2>/dev/null || true)")
  keep+=("$(cat "$BASE/staging/deployed-version" 2>/dev/null || true)")
  limit="$(date -u -d "-$IMAGE_KEEP_DAYS days" +%s)"

  docker image ls "$IMAGE_REPO" --format '{{.Tag}}' | while read -r tag; do
    if [ "$tag" = "<none>" ] || [[ " ${keep[*]} " == *" $tag "* ]]; then
      continue
    fi
    created="$(docker image inspect --format '{{.Created}}' "$IMAGE_REPO:$tag")" || continue
    created_at="$(date -u -d "$created" +%s)" || continue
    if [ "$created_at" -ge "$limit" ]; then
      continue
    fi
    if docker image rm "$IMAGE_REPO:$tag" >/dev/null; then
      echo "    removed $tag (built $created)"
    else
      echo "    could not remove $tag (still in use?)"
    fi
  done
  # Layers no tagged image uses any more
  docker image prune --force >/dev/null
}
