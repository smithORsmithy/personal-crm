#!/usr/bin/env bash
# One-time server setup for the app. Safe to run again. Needs the shared
# server preparation first (Docker, nginx, certificate: prepare-server.sh
# in the personal-crm-landing repo).
# Touches only its own things: the user deploy-app, the folder /srv/crm,
# the nginx file for app.linkbook.site (takes it over from the placeholder),
# the daily backup timer crm-backup, and read access to the server's journal
# (container logs) for the admin login that runs it.
#
# Run (root login is off; sudo asks for the crmapp password):
#   scp deploy/setup-server.sh crm:setup-app.sh
#   ssh -t crm "sudo bash ~/setup-app.sh '<deploy public key>'"
# Run again without the key: the key that is set stays.
set -euo pipefail

DEPLOY_PUBKEY="${1:-}"
DOMAIN="app.linkbook.site"
DEPLOY_USER="deploy-app"
BASE="/srv/crm"
NGINX_SITE="/etc/nginx/sites-available/$DOMAIN"
APP_PORT=3000
AUTHORIZED_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo" >&2
  exit 1
fi
for f in /etc/nginx/snippets/linkbook-tls.conf /etc/nginx/snippets/acme-challenge.conf /etc/docker/daemon.json; do
  if [ ! -f "$f" ]; then
    echo "$f is missing: run prepare-server.sh first" >&2
    exit 1
  fi
done

echo "==> Deploy user $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
# Runs docker compose for the app; the docker group is what allows that
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -n "$DEPLOY_PUBKEY" ]; then
  # restrict: no port forwarding, no agent, no terminal - commands only
  printf 'restrict %s\n' "$DEPLOY_PUBKEY" > "$AUTHORIZED_KEYS"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTHORIZED_KEYS"
  chmod 600 "$AUTHORIZED_KEYS"
elif [ -s "$AUTHORIZED_KEYS" ]; then
  echo "    kept the deploy key that is set"
else
  echo "No deploy key is set yet: pass the deploy public key as the first argument" >&2
  exit 1
fi

echo "==> Folder $BASE"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE" "$BASE/deploy"

echo "==> nginx: $DOMAIN -> 127.0.0.1:$APP_PORT"
cat > "$NGINX_SITE" <<EOF
# App. Managed by deploy/setup-server.sh in the personal-crm repo.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    include snippets/acme-challenge.conf;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    include snippets/linkbook-tls.conf;
    server_tokens off;
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
    }

    # While the app is down or not deployed yet: the placeholder page, status 503
    error_page 502 504 =503 @app_down;
    location @app_down {
        root /var/www/placeholder;
        add_header Cache-Control "no-store" always;
        try_files /index.html =503;
    }
}
EOF
ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

echo "==> Daily backup of the production database at 03:00 Moscow time"
cat > /etc/systemd/system/crm-backup.service <<EOF
# Managed by deploy/setup-server.sh in the personal-crm repo.
[Unit]
Description=Daily backup of the personal-crm production database

[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=$BASE/deploy/backup.sh
EOF
cat > /etc/systemd/system/crm-backup.timer <<'EOF'
# Managed by deploy/setup-server.sh in the personal-crm repo.
[Unit]
Description=Daily backup of the personal-crm production database

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Moscow
# If the server was off at 03:00, the backup runs once it is back
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now --quiet crm-backup.timer
systemctl list-timers crm-backup.timer --no-legend | sed 's/^/    /'

# Container logs are in the server's journal: the admin login reads them
# without sudo (read only)
ADMIN_USER="${SUDO_USER:-}"
if [ -n "$ADMIN_USER" ] && [ "$ADMIN_USER" != "root" ]; then
  echo "==> Logs: $ADMIN_USER reads the journal"
  usermod -aG systemd-journal "$ADMIN_USER"
fi

echo "==> Done. Next: create $BASE/.env (see README), then push to main"
