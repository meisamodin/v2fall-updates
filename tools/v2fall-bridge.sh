#!/usr/bin/env bash
# V2Fall bridge (relay) — run on YOUR server INSIDE Iran that can still reach the internet.
# Installs Xray as a small relay and prints a vless:// link. In V2Fall: add the link, then
# Settings → Internet shutdown mode → Bridge server → pick it, and turn on "go through the bridge".
#
#   bash v2fall-bridge.sh            install (or reinstall) on a random port
#   PORT=443 bash v2fall-bridge.sh   choose the port
#   bash v2fall-bridge.sh uninstall  remove everything
set -euo pipefail

XRAY_VERSION="${XRAY_VERSION:-26.10.31}"
DIR=/usr/local/v2fall-bridge
SVC=v2fall-bridge
say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "uninstall" ]; then
  systemctl disable --now "$SVC" 2>/dev/null || true
  rm -rf "$DIR" "/etc/systemd/system/$SVC.service"; systemctl daemon-reload 2>/dev/null || true
  say "Bridge removed."; exit 0
fi

[ "${V2F_TEST:-}" = 1 ] || [ "$(id -u)" = 0 ] || die "Run as root (sudo bash $0)."
PORT="${PORT:-$(shuf -i 20000-60000 -n 1)}"
case "$PORT" in ''|*[!0-9]*) die "PORT must be a number";; esac

case "$(uname -m)" in
  x86_64|amd64) XA=64 ;;
  aarch64|arm64) XA=arm64-v8a ;;
  *) die "Unsupported CPU: $(uname -m)" ;;
esac

mkdir -p "$DIR"
if [ "${V2F_TEST:-}" != 1 ]; then
  command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip; } || die "Please install unzip"
  say "Downloading Xray $XRAY_VERSION..."
  tmp=$(mktemp -d)
  ok=0
  if [ -n "${XRAY_ZIP:-}" ]; then cp "$XRAY_ZIP" "$tmp/x.zip" && ok=1
  elif curl -fL --connect-timeout 15 -o "$tmp/x.zip" "https://github.com/XTLS/Xray-core/releases/download/v$XRAY_VERSION/Xray-linux-$XA.zip"; then ok=1; fi
  [ $ok = 1 ] || die "Could not download Xray. Put Xray-linux-$XA.zip next to this script and run: XRAY_ZIP=./Xray-linux-$XA.zip bash $0"
  unzip -o -q "$tmp/x.zip" xray -d "$DIR" && chmod 755 "$DIR/xray"; rm -rf "$tmp"
fi
XRAY="${XRAY_BIN:-$DIR/xray}"

# keep the same id on reinstall so links you already shared keep working
if [ -f "$DIR/uuid" ]; then UUID=$(cat "$DIR/uuid"); else UUID=$("$XRAY" uuid); echo "$UUID" > "$DIR/uuid"; fi

cat > "$DIR/config.json" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "tag": "in", "listen": "0.0.0.0", "port": $PORT, "protocol": "vless",
    "settings": { "clients": [{ "id": "$UUID" }], "decryption": "none" },
    "streamSettings": { "network": "tcp", "security": "none" },
    "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true }
  }],
  "outbounds": [
    { "tag": "direct", "protocol": "freedom", "settings": { "domainStrategy": "UseIPv4" } },
    { "tag": "block", "protocol": "blackhole" }
  ],
  "routing": { "rules": [
    { "type": "field", "ip": ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "::1/128", "fc00::/7"], "outboundTag": "block" }
  ] }
}
EOF
"$XRAY" run -test -c "$DIR/config.json" >/dev/null || die "Config test failed"

if [ "${V2F_TEST:-}" != 1 ]; then
  cat > "/etc/systemd/system/$SVC.service" <<EOF
[Unit]
Description=V2Fall bridge (Xray relay)
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=$DIR/xray run -c $DIR/config.json
Restart=always
RestartSec=3
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$SVC" >/dev/null 2>&1 || systemctl restart "$SVC"
  command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active" && ufw allow "$PORT"/tcp >/dev/null || true
  sleep 1; systemctl is-active --quiet "$SVC" || die "Service did not start: journalctl -u $SVC -n 30"
fi

IP="${PUBLIC_IP:-$(curl -4 -fs --max-time 8 https://api.ipify.org || curl -4 -fs --max-time 8 https://ifconfig.me || hostname -I | awk '{print $1}')}"
NET=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://www.gstatic.com/generate_204 || true)

echo
say "✅ Bridge is running on port $PORT"
[ "$NET" = 204 ] || printf '\033[1;33m%s\033[0m\n' "⚠ This server cannot reach the internet right now (test returned '$NET'). A bridge only helps if it can."
echo
echo "Add this link to V2Fall and choose it as the bridge server:"
echo
echo "vless://$UUID@$IP:$PORT?type=tcp&security=none&encryption=none#Bridge-IR"
echo
