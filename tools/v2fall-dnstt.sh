#!/usr/bin/env bash
# V2Fall DNSTT (DNS tunnel) server — run on YOUR server OUTSIDE Iran.
# Before running, in your domain's DNS panel create:
#     ns.example.com   A    <this server's IP>
#     t.example.com    NS   ns.example.com
# then:  bash v2fall-dnstt.sh t.example.com
# It prints a dnstt:// link to add in V2Fall (Add → Link, or the DNSTT tab).
#
#   bash v2fall-dnstt.sh uninstall   remove everything
set -euo pipefail

XRAY_VERSION="${XRAY_VERSION:-26.10.31}"
TOOLS="${TOOLS_URL:-https://github.com/meisamodin/v2fall-updates/raw/main/tools}"
DIR=/usr/local/v2fall-dnstt
say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "uninstall" ]; then
  systemctl disable --now v2fall-dnstt v2fall-dnstt-socks 2>/dev/null || true
  rm -rf "$DIR" /etc/systemd/system/v2fall-dnstt.service /etc/systemd/system/v2fall-dnstt-socks.service
  systemctl daemon-reload 2>/dev/null || true
  say "DNSTT removed."; exit 0
fi

DOMAIN="$(echo "${1:-}" | tr 'A-Z' 'a-z')"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Usage: bash $0 t.example.com   (the subdomain whose NS points to this server)"
[ "${V2F_TEST:-}" = 1 ] || [ "$(id -u)" = 0 ] || die "Run as root (sudo bash $0 $DOMAIN)."

case "$(uname -m)" in
  x86_64|amd64) A=amd64; XA=64 ;;
  aarch64|arm64) A=arm64; XA=arm64-v8a ;;
  *) die "Unsupported CPU: $(uname -m)" ;;
esac
mkdir -p "$DIR"

if [ "${V2F_TEST:-}" != 1 ]; then
  command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip; } || die "Please install unzip"
  command -v iptables >/dev/null || { apt-get update -qq && apt-get install -y -qq iptables; } || die "Please install iptables"
  say "Downloading dnstt-server and Xray..."
  curl -fL --connect-timeout 15 -o "$DIR/dnstt-server" "$TOOLS/dnstt-server-linux-$A" || die "Could not download dnstt-server"
  chmod 755 "$DIR/dnstt-server"
  tmp=$(mktemp -d)
  curl -fL --connect-timeout 15 -o "$tmp/x.zip" "https://github.com/XTLS/Xray-core/releases/download/v$XRAY_VERSION/Xray-linux-$XA.zip" || die "Could not download Xray"
  unzip -o -q "$tmp/x.zip" xray -d "$DIR" && chmod 755 "$DIR/xray"; rm -rf "$tmp"
fi
DNSTT="${DNSTT_BIN:-$DIR/dnstt-server}"; XRAY="${XRAY_BIN:-$DIR/xray}"

# keys (kept on reinstall so existing links keep working)
if [ ! -s "$DIR/server.key" ]; then
  "$DNSTT" -gen-key -privkey-file "$DIR/server.key" -pubkey-file "$DIR/server.pub" >/dev/null
  chmod 600 "$DIR/server.key"
fi
PUB=$(tr -d '[:space:]' < "$DIR/server.pub")
[[ "$PUB" =~ ^[0-9a-f]{64}$ ]] || die "Key generation failed"

# a SOCKS5 server only reachable from this machine; the tunnel delivers traffic to it
cat > "$DIR/socks.json" <<'EOF'
{
  "log": { "loglevel": "warning" },
  "inbounds": [{ "listen": "127.0.0.1", "port": 1081, "protocol": "socks", "settings": { "auth": "noauth", "udp": true } }],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }, { "protocol": "blackhole", "tag": "block" }],
  "routing": { "rules": [{ "type": "field", "ip": ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"], "outboundTag": "block" }] }
}
EOF
"$XRAY" run -test -c "$DIR/socks.json" >/dev/null || die "SOCKS config test failed"

if [ "${V2F_TEST:-}" != 1 ]; then
  IFACE=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
  [ -n "$IFACE" ] || IFACE=eth0
  cat > /etc/systemd/system/v2fall-dnstt-socks.service <<EOF
[Unit]
Description=V2Fall DNSTT backend (local SOCKS5)
After=network-online.target
[Service]
ExecStart=$DIR/xray run -c $DIR/socks.json
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
  # dnstt listens on 5300; port 53 on the public interface is redirected to it (no clash with systemd-resolved)
  cat > /etc/systemd/system/v2fall-dnstt.service <<EOF
[Unit]
Description=V2Fall DNSTT server ($DOMAIN)
After=network-online.target v2fall-dnstt-socks.service
Wants=v2fall-dnstt-socks.service
[Service]
ExecStartPre=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports 5300
ExecStartPre=/usr/sbin/iptables -t nat -I PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports 5300
ExecStart=$DIR/dnstt-server -udp :5300 -privkey-file $DIR/server.key $DOMAIN 127.0.0.1:1081
ExecStopPost=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports 5300
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now v2fall-dnstt-socks v2fall-dnstt >/dev/null 2>&1 || systemctl restart v2fall-dnstt-socks v2fall-dnstt
  command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active" && { ufw allow 53/udp >/dev/null; ufw allow 5300/udp >/dev/null; } || true
  sleep 1
  systemctl is-active --quiet v2fall-dnstt || die "dnstt did not start: journalctl -u v2fall-dnstt -n 30"
fi

echo
say "✅ DNSTT is running for $DOMAIN"
echo "Check the DNS records: $DOMAIN must have an NS record pointing to a name whose A record is this server."
echo
echo "Add this link to V2Fall (you can change the resolver later — during a shutdown use your ISP's DNS IP):"
echo
echo "dnstt://$PUB@$DOMAIN?resolver=udp%3A8.8.8.8%3A53&mode=socks#DNSTT"
echo
