#!/usr/bin/env bash
# Daily backup of the production database. Run every day at 03:00 Moscow
# time by the systemd timer crm-backup.timer (see setup-server.sh), as the
# deploy user; its output goes to the server's journal:
#   journalctl -u crm-backup
# File: <UTC time>_<app version>_daily.dump in /srv/crm/backups; the 7
# newest daily backups are kept. Waits up to 30 minutes for a running
# deploy or restore of production.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
source "$(dirname "$0")/common.sh"

use_environment prod
require_env_file
take_lock 1800

VERSION="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "==> Daily backup of production (app version ${VERSION:-none})"
# The database is not started here: if it is down, the backup fails and
# says so, and nothing else changes
if ! backup_db "${VERSION:-none}" daily; then
  echo "Daily backup FAILED" >&2
  exit 1
fi
echo "    $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
prune_backups || echo "    could not remove old backups" >&2
echo "==> Done"
