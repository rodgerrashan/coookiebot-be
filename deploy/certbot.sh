#!/usr/bin/env bash
set -euo pipefail

DOMAIN_NAME="${DOMAIN_NAME:-api.coookietrade.online}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
CERTBOT_ENABLED="${CERTBOT_ENABLED:-true}"

log() {
	echo "[certbot] $1"
}

if [ "$CERTBOT_ENABLED" != "true" ]; then
	log "CERTBOT_ENABLED is not true. Skipping certificate setup."
	exit 0
fi

if [ -f "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" ]; then
	log "Certificate already exists for $DOMAIN_NAME"
	exit 0
fi

if [ -z "$CERTBOT_EMAIL" ]; then
	log "CERTBOT_EMAIL is empty and no certificate exists yet. Skipping issuance."
	exit 0
fi

nginx -t
systemctl restart nginx

log "Requesting certificate for $DOMAIN_NAME"
certbot --nginx --non-interactive --agree-tos --redirect -m "$CERTBOT_EMAIL" -d "$DOMAIN_NAME"

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

log "Certificate setup completed"
