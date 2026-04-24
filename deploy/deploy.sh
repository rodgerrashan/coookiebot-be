#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-appsvc}"
APP_BASE_DIR="${APP_BASE_DIR:-/opt/coookiebot-be}"
SOURCE_TARBALL="${SOURCE_TARBALL:-/tmp/coookiebot-be.tgz}"
ENV_FILE="${ENV_FILE:-/etc/coookiebot-be.env}"
PM2_APP_NAME="${PM2_APP_NAME:-coookiebot}"

log() {
	echo "[deploy] $1"
}

if [ ! -f "$SOURCE_TARBALL" ]; then
	echo "[deploy] SOURCE_TARBALL not found: $SOURCE_TARBALL"
	exit 1
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
	echo "[deploy] App user not found: $APP_USER. Run deploy/setup.sh first."
	exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
	echo "[deploy] ENV_FILE not found: $ENV_FILE"
	exit 1
fi

if ! runuser -u "$APP_USER" -- test -r "$ENV_FILE"; then
	log "Adjusting $ENV_FILE permissions for user $APP_USER"
	chown "$APP_USER:$APP_USER" "$ENV_FILE"
	chmod 600 "$ENV_FILE"
fi

mkdir -p "$APP_BASE_DIR/releases" "$APP_BASE_DIR/shared"
chown -R "$APP_USER:$APP_USER" "$APP_BASE_DIR"

RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_BASE_DIR/releases/$RELEASE_ID"

log "Creating release directory: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$SOURCE_TARBALL" -C "$RELEASE_DIR"
chown -R "$APP_USER:$APP_USER" "$RELEASE_DIR"

APP_DIR=""
if [ -f "$RELEASE_DIR/package.json" ]; then
	APP_DIR="$RELEASE_DIR"
elif [ -f "$RELEASE_DIR/coookiebot-be/package.json" ]; then
	APP_DIR="$RELEASE_DIR/coookiebot-be"
else
	FOUND_PACKAGE_JSON="$(find "$RELEASE_DIR" -maxdepth 4 -name package.json | head -n 1 || true)"
	if [ -n "$FOUND_PACKAGE_JSON" ]; then
		APP_DIR="$(dirname "$FOUND_PACKAGE_JSON")"
	fi
fi

if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/package.json" ]; then
	echo "[deploy] package.json not found in release: $RELEASE_DIR"
	exit 1
fi

if [ -f "$APP_DIR/package-lock.json" ]; then
	log "Installing dependencies with npm ci"
	runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm ci --omit=dev"
else
	log "package-lock.json not found, using npm install"
	runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm install --omit=dev"
fi

ln -sfn "$APP_DIR" "$APP_BASE_DIR/current"

runuser -u "$APP_USER" -- bash -lc "
set -euo pipefail
export PATH=\"\$PATH:/usr/bin:/usr/local/bin\"
if [ -f '$ENV_FILE' ]; then
	set -a
	source '$ENV_FILE'
	set +a
fi
cd '$APP_BASE_DIR/current'
if pm2 describe '$PM2_APP_NAME' >/dev/null 2>&1; then
	pm2 restart '$PM2_APP_NAME' --update-env
else
	pm2 start server.js --name '$PM2_APP_NAME' --update-env
fi
pm2 save
"

log "Deployment completed"
