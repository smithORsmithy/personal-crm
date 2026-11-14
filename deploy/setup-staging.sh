#!/usr/bin/env bash
# One-time setup of the test stand (https://test-app.linkbook.site) on the
# server. Safe to run again. Needs setup-server.sh first (the user
# deploy-app and the folder /srv/crm).
# Touches only its own things: the folder /srv/crm/staging, the nginx file
# for test-app.linkbook.site, its password file and its own certificate.
#
# Run (root login is off; sudo asks for the crmapp password):
#   scp deploy/setup-staging.sh crm:setup-staging.sh
#   ssh -t crm "sudo bash ~/setup-staging.sh"
# The script asks for the login and the password of the test stand; only
# their hash is kept.
set -euo pipefail

DOMAIN="test-app.linkbook.site"
DEPLOY_USER="deploy-app"
STAGING_DIR="/srv/crm/staging"
# The same port as for staging in common.sh
APP_PORT=3001
ACME_DIR="/var/www/letsencrypt"
PLACEHOLDER_DIR="/var/www/placeholder"
NGINX_SITE="/etc/nginx/sites-available/$DOMAIN"
PASSWORD_FILE="/etc/nginx/$DOMAIN.htpasswd"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo" >&2
  exit 1
fi
if ! id "$DEPLOY_USER" >/dev/null 2>&1 || [ ! -d /srv/crm ]; then
  echo "No $DEPLOY_USER or /srv/crm: run setup-server.sh first" >&2
  exit 1
fi
for f in /etc/nginx/snippets/acme-challenge.conf "$PLACEHOLDER_DIR/index.html"; do
  if [ ! -f "$f" ]; then
    echo "$f is missing: run prepare-server.sh from the landing repo first" >&2
    exit 1
  fi
done

echo "==> Folder $STAGING_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STAGING_DIR"
# Secrets of the test stand: a person fills it in (see README)
if [ ! -f "$STAGING_DIR/.env" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$STAGING_DIR/.env"
  echo "    created an empty $STAGING_DIR/.env"
fi

ask_password() {
  local login pw1 pw2 hash tmp
  if [ ! -t 0 ]; then
    echo "The script asks for a password: run it with 'ssh -t'" >&2
    exit 1
  fi
  while true; do
    read -r -p "Login for the test stand (letters and digits): " login
    if printf '%s' "$login" | grep -Eq '^[A-Za-z0-9._-]+$'; then
      break
    fi
    echo "Only Latin letters, digits, dot, dash and underscore, please"
  done
  while true; do
    read -r -s -p "Password (at least 12 characters): " pw1
    echo
    read -r -s -p "The same password again: " pw2
    echo
    if [ "$pw1" != "$pw2" ]; then
      echo "The passwords differ, try again"
    elif [ "${#pw1}" -lt 12 ]; then
      echo "Too short, try again"
    else
      break
    fi
  done
  # SHA-512 crypt hash: nginx checks it, the password itself is not stored
  hash="$(printf '%s\n' "$pw1" | openssl passwd -6 -stdin)"
  tmp="$(mktemp)"
  printf '%s:%s\n' "$login" "$hash" > "$tmp"
  install -m 640 -o root -g www-data "$tmp" "$PASSWORD_FILE"
  rm -f "$tmp"
  echo "    saved the login $login and the hash of the password"
}

echo "==> Password of the test stand"
if [ -s "$PASSWORD_FILE" ]; then
  answer=""
  if [ -t 0 ]; then
    read -r -p "The password is set already. Type yes to set a new one, or press Enter to keep it: " answer || answer=""
  fi
  if [ "$answer" = "yes" ]; then
    ask_password
  else
    echo "    kept the password that is set"
  fi
else
  ask_password
fi

write_site() {
  {
    cat <<EOF
# Test stand. Managed by deploy/setup-staging.sh in the personal-crm repo.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    include snippets/acme-challenge.conf;

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
    if [ -f "$CERT_DIR/fullchain.pem" ]; then
      cat <<EOF

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    # Its own certificate: the shared one of linkbook.site is not touched
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    client_max_body_size 1m;

    # The whole test stand is behind a password
    auth_basic "Test stand";
    auth_basic_user_file $PASSWORD_FILE;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        # The password stays with nginx: the app never sees it
        proxy_set_header Authorization "";
    }

    # Open without the password: only the status and the version, for the
    # check after a deploy
    location = /health {
        auth_basic off;
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Connection "";
        proxy_set_header Authorization "";
    }

    # While the app is down or not deployed yet: the placeholder page, status 503
    error_page 502 504 =503 @app_down;
    location @app_down {
        auth_basic off;
        root $PLACEHOLDER_DIR;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files /index.html =503;
    }
}
EOF
    fi
  } > "$NGINX_SITE"
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$DOMAIN"
  # The server is shared: a config nginx rejects must not stay switched on
  if ! nginx -t; then
    rm -f "/etc/nginx/sites-enabled/$DOMAIN"
    echo "nginx rejected the config of $DOMAIN: it is switched off, nothing else was changed" >&2
    exit 1
  fi
  systemctl reload nginx
}

echo "==> nginx: $DOMAIN (http, for the certificate check)"
write_site

echo "==> Certificate for $DOMAIN"
# Uses the Let's Encrypt account that prepare-server.sh registered.
# Renewed by the certbot timer; nginx reloads after each renewal.
certbot certonly --webroot -w "$ACME_DIR" --cert-name "$DOMAIN" -d "$DOMAIN" \
  --non-interactive --agree-tos --keep-until-expiring \
  --deploy-hook "systemctl reload nginx"

echo "==> nginx: $DOMAIN -> 127.0.0.1:$APP_PORT, https, behind the password"
write_site
if certbot renew --dry-run --cert-name "$DOMAIN" --quiet; then
  echo "    renewal dry run: ok"
else
  echo "    renewal dry run FAILED: the certificate works now, but may not renew" >&2
fi

echo "==> Local checks"
check() {
  curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$1"
}
echo "    https://$DOMAIN/ without the password: $(check /) (expected 401)"
echo "    https://$DOMAIN/health: $(check /health) (200 once the stand is deployed, 503 before)"

echo "==> Done. Next: fill in $STAGING_DIR/.env (see README)"
