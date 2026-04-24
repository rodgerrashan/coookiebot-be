#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

APP_PORT="${APP_PORT:-5005}"
APP_USER="${APP_USER:-appsvc}"
APP_BASE_DIR="${APP_BASE_DIR:-/opt/coookiebot-be}"
NODE_MAJOR="${NODE_MAJOR:-20}"
ENV_FILE="${ENV_FILE:-/etc/coookiebot-be.env}"

log() {
	echo "[setup] $1"
}

log "Updating apt repositories"
apt-get update -y

log "Installing OS packages"
apt-get install -y ca-certificates curl gnupg git nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
	log "Installing Node.js ${NODE_MAJOR}.x"
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
	apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
	log "Installing PM2 globally"
	npm install -g pm2
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
	log "Creating app user $APP_USER"
	useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

if systemctl list-unit-files | grep -q '^coookiebot\.service'; then
	log "Disabling legacy coookiebot systemd service"
	systemctl disable --now coookiebot.service || true
	rm -f /etc/systemd/system/coookiebot.service
	systemctl daemon-reload
fi

log "Configuring PM2 startup for user $APP_USER"
env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" || true

log "Preparing app directories"
mkdir -p "$APP_BASE_DIR/current" "$APP_BASE_DIR/releases" "$APP_BASE_DIR/shared"
chown -R "$APP_USER:$APP_USER" "$APP_BASE_DIR"

if [ ! -f "$ENV_FILE" ]; then
	log "Creating default environment file at $ENV_FILE"
	cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$APP_PORT
# FRONTEND_URL=https://app.coookietrade.online
# CORS_ORIGINS=https://app.coookietrade.online
# MONGO_URI=
# JWT_SECRET=
# SENDER_EMAIL=
# SMTP_USER=
# SMTP_PASS=
EOF
fi

chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

systemctl enable nginx
systemctl restart nginx

log "Setup completed"
