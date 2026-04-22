#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-appsvc}"
APP_BASE_DIR="${APP_BASE_DIR:-/opt/coookiebot-be}"
SERVICE_NAME="${SERVICE_NAME:-coookiebot}"
SOURCE_TARBALL="${SOURCE_TARBALL:-/tmp/coookiebot-be.tgz}"

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

mkdir -p "$APP_BASE_DIR/releases" "$APP_BASE_DIR/shared"
chown -R "$APP_USER:$APP_USER" "$APP_BASE_DIR"

RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_BASE_DIR/releases/$RELEASE_ID"

log "Creating release directory: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$SOURCE_TARBALL" -C "$RELEASE_DIR"
chown -R "$APP_USER:$APP_USER" "$RELEASE_DIR"

if [ -f "$RELEASE_DIR/package-lock.json" ]; then
	log "Installing dependencies with npm ci"
	runuser -u "$APP_USER" -- bash -lc "cd '$RELEASE_DIR' && npm ci --omit=dev"
else
	log "package-lock.json not found, using npm install"
	runuser -u "$APP_USER" -- bash -lc "cd '$RELEASE_DIR' && npm install --omit=dev"
fi

ln -sfn "$RELEASE_DIR" "$APP_BASE_DIR/current"

systemctl daemon-reload
systemctl restart "$SERVICE_NAME.service"

log "Deployment completed"
