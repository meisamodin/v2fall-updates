#!/usr/bin/env bash
# V2Fall Soar (DNS tunnel for shutdowns) server — run on YOUR server OUTSIDE Iran.
# Soar: github.com/getlantern/soar (Apache-2.0). Unbar's servers are Soar too: the link works in V2Fall and Unbar.
# Before running, in your domain's DNS panel create:
#     ns.example.com   A    <this server's IP>      (Cloudflare: "DNS only", grey cloud)
#     t.example.com    NS   ns.example.com
# then:  bash v2fall-soar.sh t.example.com
# It prints a soar:// link to add in V2Fall (Add → Link), and the same server as an unbar:// link.
#
#   bash v2fall-soar.sh uninstall   remove everything (the key too)
#   bash v2fall-soar.sh link        print the links again
set -euo pipefail

TOOLS="${TOOLS_URL:-https://github.com/meisamodin/v2fall-updates/raw/main/tools}"
DIR="${SOAR_DIR:-/usr/local/v2fall-soar}"
say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "uninstall" ]; then
  systemctl disable --now v2fall-soar 2>/dev/null || true
  rm -rf "$DIR" /etc/systemd/system/v2fall-soar.service
  systemctl daemon-reload 2>/dev/null || true
  say "Soar removed."; exit 0
fi

links() {
  local Z PUB U
  Z=$(cat "$DIR/zone"); PUB=$("$DIR/soar-server" pubkey "$DIR/key")
  U=$(printf '{"v":1,"name":"Soar %s","zone":"%s","pubkey":"%s","resolverMode":"DISCOVERY","resolvers":[],"country":"IR"}' "$Z" "$Z" "$PUB" | base64 -w0 | tr '+/' '-_' | tr -d '=')
  echo
  say "✅ Soar is running for $Z"
  echo "Check the DNS records: $Z must have an NS record pointing to a name whose A record is this server."
  echo
  echo "Add this link to V2Fall (Add → Link). It uses your carrier's DNS and finds working resolvers by itself:"
  echo
  echo "soar://$(printf %s "$PUB" | tr '+/' '-_' | tr -d '=')@$Z#Soar"
  echo
  echo "The same server for the Unbar app:"
  echo "unbar://$U"
  echo
}
if [ "${1:-}" = "link" ]; then [ -s "$DIR/key" ] || die "Soar is not installed."; links; exit 0; fi

ZONE="$(echo "${1:-}" | tr 'A-Z' 'a-z')"
[[ "$ZONE" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Usage: bash $0 t.example.com   (the subdomain whose NS points to this server)"
[ "${V2F_TEST:-}" = 1 ] || [ "$(id -u)" = 0 ] || die "Run as root (sudo bash $0 $ZONE)."
case "$(uname -m)" in
  x86_64|amd64) A=amd64 ;;
  aarch64|arm64) A=arm64 ;;
  *) die "Unsupported CPU: $(uname -m)" ;;
esac
mkdir -p "$DIR"; chmod 700 "$DIR"
PORT="${SOAR_PORT:-5302}"

if [ "${V2F_TEST:-}" != 1 ]; then
  command -v iptables >/dev/null || { apt-get update -qq && apt-get install -y -qq iptables; } || die "Please install iptables"
  say "Downloading the Soar server..."
  curl -fL --connect-timeout 15 -o "$DIR/soar-server.new" "$TOOLS/soar-server-linux-$A" || die "Could not download the server"
  chmod 755 "$DIR/soar-server.new" && mv -f "$DIR/soar-server.new" "$DIR/soar-server"
else
  cp -f "${SOAR_BIN:?}" "$DIR/soar-server"
fi
# the key is kept on reinstall, so links already handed out keep working
[ -s "$DIR/key" ] || (umask 077; "$DIR/soar-server" keygen | awk '$1 == "private" { print $2 }' > "$DIR/key")
echo "$ZONE" > "$DIR/zone"
# the destinations a tunnel may reach: the web, DoT, Telegram/WhatsApp, mail clients; not 25 (no spam from your server)
PORTS="${SOAR_PORTS:-80,443,853,5222,5223,8080,8443,993,995,587,2053,2083,2087,2096,8880}"

if [ "${V2F_TEST:-}" != 1 ]; then
  IFACE=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
  [ -n "$IFACE" ] || IFACE=eth0
  # the server listens on UDP $PORT; port 53 on the public interface is redirected to it (no clash with systemd-resolved).
  # (TCP/53 is between the phone and its resolver; resolvers reach this server over UDP)
  cat > /etc/systemd/system/v2fall-soar.service <<UNIT
[Unit]
Description=V2Fall Soar DNS tunnel server ($ZONE)
After=network-online.target
[Service]
WorkingDirectory=$DIR
ExecStartPre=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $PORT
ExecStartPre=/usr/sbin/iptables -t nat -I PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $PORT
ExecStart=$DIR/soar-server -zone $ZONE -key-file $DIR/key -listen :$PORT -allow-ports $PORTS
ExecStopPost=-/usr/sbin/iptables -t nat -D PREROUTING -i $IFACE -p udp --dport 53 -j REDIRECT --to-ports $PORT
Restart=always
RestartSec=3
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable v2fall-soar >/dev/null 2>&1 || true
  systemctl restart v2fall-soar
  command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active" && { ufw allow 53/udp >/dev/null; ufw allow "$PORT"/udp >/dev/null; } || true
  sleep 2
  systemctl is-active --quiet v2fall-soar || die "The server did not start: journalctl -u v2fall-soar -n 30"
else
  ("$DIR/soar-server" -zone "$ZONE" -key-file "$DIR/key" -listen "127.0.0.1:$PORT" -allow-ports "$PORTS" > "$DIR/server.log" 2>&1 &)
  sleep 1
fi
links
