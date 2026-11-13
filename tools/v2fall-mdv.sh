#!/usr/bin/env bash
# V2Fall MasterDnsVPN (fast DNS tunnel) server — run on YOUR server OUTSIDE Iran.
# Before running, in your domain's DNS panel create:
#     ns.example.com   A    <this server's IP>      (Cloudflare: "DNS only", grey cloud)
#     t.example.com    NS   ns.example.com
# then:  bash v2fall-mdv.sh t.example.com
# It prints an mdv:// link to add in V2Fall (Add → Link, or the MasterDNS tab).
#
#   bash v2fall-mdv.sh uninstall   remove everything
set -euo pipefail

TOOLS="${TOOLS_URL:-https://github.com/meisamodin/v2fall-updates/raw/main/tools}"
DIR=/usr/local/v2fall-mdv
say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "uninstall" ]; then
  systemctl disable --now v2fall-mdv 2>/dev/null || true
  rm -rf "$DIR" /etc/systemd/system/v2fall-mdv.service
  systemctl daemon-reload 2>/dev/null || true
  say "MasterDnsVPN removed."; exit 0
fi

DOMAIN="$(echo "${1:-}" | tr 'A-Z' 'a-z')"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Usage: bash $0 t.example.com   (the subdomain whose NS points to this server)"
[ "${V2F_TEST:-}" = 1 ] || [ "$(id -u)" = 0 ] || die "Run as root (sudo bash $0 $DOMAIN)."
case "$(uname -m)" in
  x86_64|amd64) A=amd64 ;;
  aarch64|arm64) A=arm64 ;;
  *) die "Unsupported CPU: $(uname -m)" ;;
esac
mkdir -p "$DIR"
UDP_PORT="${MDV_PORT:-5301}"

if [ "${V2F_TEST:-}" != 1 ]; then
  command -v iptables >/dev/null || { apt-get update -qq && apt-get install -y -qq iptables; } || die "Please install iptables"
  say "Downloading the MasterDnsVPN server..."
  curl -fL --connect-timeout 15 -o "$DIR/mdv-server" "$TOOLS/mdv-server-linux-$A" || die "Could not download the server"
  chmod 755 "$DIR/mdv-server"
fi
BIN="${MDV_BIN:-$DIR/mdv-server}"

# ChaCha20 (method 2). The server writes encrypt_key.txt on its first start and keeps it on reinstall,
# so links already handed out keep working.
cat > "$DIR/server_config.toml" <<CFG
DOMAIN = ["$DOMAIN"]
PROTOCOL_TYPE = "SOCKS5"
UDP_HOST = "${MDV_HOST:-}"
UDP_PORT = $UDP_PORT
DATA_ENCRYPTION_METHOD = 2
ENCRYPTION_KEY_FILE = "encrypt_key.txt"
CFG

if [ "${V2F_TEST:-}" != 1 ]; then
  IFACE=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
  [ -n "$IFACE" ] || IFACE=eth0
  # the server listens on $UDP_PORT; port 53 on the public interface is redirected to it (no clash with systemd-resolved)
  cat > /etc/systemd/system/v2fall-mdv.service <<UNIT
[Unit]
Description=V2Fall MasterDnsVPN server ($DOMAIN)
After=network-online.target
[Service]
WorkingDirectory=$DIR
ExecStartPre=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $UDP_PORT
ExecStartPre=/usr/sbin/iptables -t nat -I PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $UDP_PORT
ExecStart=$DIR/mdv-server -config $DIR/server_config.toml
ExecStopPost=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $UDP_PORT
Restart=always
RestartSec=3
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now v2fall-mdv >/dev/null 2>&1 || systemctl restart v2fall-mdv
  command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active" && { ufw allow 53/udp >/dev/null; ufw allow "$UDP_PORT"/udp >/dev/null; } || true
else
  (cd "$DIR" && "$BIN" -config "$DIR/server_config.toml" > "$DIR/server.log" 2>&1 &)
fi

for i in $(seq 1 30); do [ -s "$DIR/encrypt_key.txt" ] && break; sleep 0.5; done
KEY=$(tr -d '[:space:]' < "$DIR/encrypt_key.txt" 2>/dev/null || true)
[ -n "$KEY" ] || die "The server did not start (no key): journalctl -u v2fall-mdv -n 30"
[ "${V2F_TEST:-}" = 1 ] || systemctl is-active --quiet v2fall-mdv || die "The server did not start: journalctl -u v2fall-mdv -n 30"

ENC_KEY=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$KEY" 2>/dev/null || echo "$KEY")
echo
say "✅ MasterDnsVPN is running for $DOMAIN"
echo "Check the DNS records: $DOMAIN must have an NS record pointing to a name whose A record is this server."
echo
echo "Add this link to V2Fall (it tries your carrier's DNS and public DNS by itself):"
echo
echo "mdv://$ENC_KEY@$DOMAIN?enc=2#MasterDnsVPN"
echo
