#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/dist/web"

SSH_TARGET="${SSH_TARGET:-tc}"
REMOTE_DIR="${REMOTE_DIR:-/data/work/client/laser-mirror}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/laser-mirror.conf}"
PUBLIC_URL="${PUBLIC_URL:-http://106.55.78.71:8347/}"
REMOTE_PORT="${REMOTE_PORT:-8347}"

required_paths=(
	"index.html"
	"audio/laser_fire.mp3"
	"audio/combo-1.mp3"
	"audio/level-victory.mp3"
	"audio/game-over.mp3"
	"ui/settings-gear.png"
	"ui/victory-crown.png"
	"ui/victory-coin.png"
	"ui/app-icon.png"
	"audio/coin-pickup.mp3"
)

if [[ ! -d "$BUILD_DIR" ]]; then
	echo "Missing build directory: dist/web (run 'make build' first)." >&2
	exit 1
fi

for required_path in "${required_paths[@]}"; do
	if [[ ! -f "$BUILD_DIR/$required_path" ]]; then
		echo "Missing deploy file: dist/web/$required_path (run 'make build' first)." >&2
		exit 1
	fi
done

if ! find "$BUILD_DIR/assets" -type f \( -name '*.js' -o -name '*.css' \) | grep -q .; then
	echo "Missing hashed assets in dist/web/assets (run 'make build' first)." >&2
	exit 1
fi

echo "Uploading game build to $SSH_TARGET:$REMOTE_DIR ..."
COPYFILE_DISABLE=1 tar -C "$BUILD_DIR" --no-xattrs --exclude '._*' -cf - . | ssh "$SSH_TARGET" "
	set -euo pipefail
	TARGET='$REMOTE_DIR'
	TMP=\"\${TARGET}.deploy.\$\$\"
	PREV=\"\${TARGET}.previous\"
	trap 'rm -rf \"\$TMP\"' EXIT
	rm -rf \"\$TMP\"
	mkdir -p \"\$TMP\"
	tar -C \"\$TMP\" -xf -
	find \"\$TMP\" -type d -exec chmod 0755 {} +
	find \"\$TMP\" -type f -exec chmod 0644 {} +
	test -f \"\$TMP/index.html\"
	test -f \"\$TMP/audio/laser_fire.mp3\"
	rm -rf \"\$PREV\"
	if [[ -d \"\$TARGET\" ]]; then
		mv \"\$TARGET\" \"\$PREV\"
	fi
	mv \"\$TMP\" \"\$TARGET\"
"

echo "Ensuring Nginx serves Laser Mirror on port $REMOTE_PORT ..."
ssh "$SSH_TARGET" \
	"NGINX_CONF='$NGINX_CONF' REMOTE_DIR='$REMOTE_DIR' REMOTE_PORT='$REMOTE_PORT' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

tmp_conf="$(mktemp)"
backup_conf=""
cleanup() {
	rm -f "$tmp_conf"
}
trap cleanup EXIT

cat >"$tmp_conf" <<NGINX
server {
    listen $REMOTE_PORT;
    listen [::]:$REMOTE_PORT;
    server_name _;

    root $REMOTE_DIR;
    index index.html;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    location / {
        add_header Cache-Control "no-cache";
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

if [[ ! -f "$NGINX_CONF" ]] || ! cmp -s "$tmp_conf" "$NGINX_CONF"; then
	if [[ -f "$NGINX_CONF" ]]; then
		backup_conf="${NGINX_CONF}.deploy-backup"
		cp "$NGINX_CONF" "$backup_conf"
	fi

	install -m 0644 "$tmp_conf" "$NGINX_CONF"
	if ! nginx -t; then
		if [[ -n "$backup_conf" ]]; then
			mv "$backup_conf" "$NGINX_CONF"
		else
			rm -f "$NGINX_CONF"
		fi
		exit 1
	fi

	rm -f "$backup_conf"
	nginx -s reload
fi

if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
	if ! firewall-cmd --quiet --query-port="$REMOTE_PORT"/tcp; then
		firewall-cmd --quiet --permanent --add-port="$REMOTE_PORT"/tcp
		firewall-cmd --quiet --reload
	fi
fi
REMOTE_SCRIPT

echo "Verifying deployed game ..."
ssh "$SSH_TARGET" \
	"curl -fsS --retry 5 --retry-delay 1 --connect-timeout 8 http://127.0.0.1:$REMOTE_PORT/" \
	| grep -Fq 'id="app"'
ssh "$SSH_TARGET" \
	"curl -fsS --retry 5 --retry-delay 1 --connect-timeout 8 http://127.0.0.1:$REMOTE_PORT/audio/laser_fire.mp3" \
	>/dev/null

echo "Deployed $PUBLIC_URL"
