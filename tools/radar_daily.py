#!/usr/bin/env python3
"""Daily Filter Radar post for the channel: how each Iranian operator did in the last 24 h and which kinds of
connection worked best, from the anonymous counters of dl.v2fall.com/radar?all=1 (nothing per user exists there).

usage: radar_daily.py            → prints the post (or nothing when there are too few reports)
       radar_daily.py --send     → also posts it (TELEGRAM_BOT_TOKEN, RADAR_CHAT or @v2fall)"""
import json, os, sys, urllib.request, urllib.parse

ISP = {197207: 'همراه اول', 44244: 'ایرانسل', 58224: 'مخابرات', 57218: 'رایتل', 31549: 'شاتل', 43754: 'آسیاتک',
       16322: 'پارس‌آنلاین', 50810: 'مبین‌نت', 56402: 'های‌وب', 25184: 'افرانت', 12880: 'زیرساخت', 49100: 'پیشگامان',
       44208: 'فن‌آوا', 39501: 'سامانتل', 42337: 'رسپینا', 24631: 'فناپ‌تلکام', 48159: 'زیرساخت (TIC)'}
P = {'VLESS': 'VLESS', 'VMESS': 'VMess', 'TROJAN': 'Trojan', 'SS': 'Shadowsocks', 'HY2': 'Hysteria2', 'TUIC': 'TUIC',
     'WG': 'WireGuard', 'AWG': 'AmneziaWG', 'WARP': 'WARP', 'SSH': 'SSH', 'ANYTLS': 'AnyTLS', 'MIERU': 'Mieru',
     'DNSTT': 'DNSTT', 'MDV': 'MasterDNS', 'TOR': 'Tor', 'PSI': 'Psiphon', 'RELAY': 'Ashflake', 'NAIVE': 'NaiveProxy'}
TR = {'tcp': 'TCP', 'ws': 'WS', 'grpc': 'gRPC', 'xhttp': 'XHTTP', 'splithttp': 'XHTTP', 'httpupgrade': 'HTTPUpgrade',
      'h2': 'H2', 'http': 'HTTP', 'kcp': 'mKCP', 'quic': 'QUIC'}
SIGN = '🆔 @v2fall\n⬇️ دانلود رایگان: v2fall.com\n📺 یوتیوب: youtube.com/@v2fall\n🤖 ربات: @v2fallbot'
FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def label(k):
    p, t, s, f = (str(k).split('|') + ['', '', '', ''])[:4]
    out = ' · '.join(x for x in [P.get(p, p), {'reality': 'Reality', 'tls': 'TLS'}.get(s, ''), TR.get(t, t.upper() if t else '')] if x)
    return out + (' + Fragment' if f == '1' else '')


def pct(ok, n):
    return round(ok * 100 / n) if n else 0


def fa(x):
    return str(x).translate(FA)


def build(data):
    ops = [o for o in data.get('ops', []) if o.get('a') in ISP and o.get('n', 0) >= 20]
    total = sum(o['n'] for o in ops)
    if len(ops) < 2 or total < 80:
        return ''
    ops.sort(key=lambda o: -o['n'])
    lines = []
    for o in ops[:8]:
        p = pct(o['ok'], o['n'])
        dot = '🟢' if p >= 70 else '🟡' if p >= 40 else '🔴'
        best = next((x for x in o.get('k', []) if x.get('n', 0) >= 5), None)
        lines.append(f"{dot} {ISP[o['a']]}: {fa(p)}٪" + (f"  ←  {label(best['k'])}" if best else ''))
    # kinds that did best across all operators (enough reports so one lucky server does not win)
    kinds = {}
    for o in ops:
        for x in o.get('k', []):
            e = kinds.setdefault(label(x['k']), [0, 0]); e[0] += x['n']; e[1] += x['ok']
    top = sorted(((k, v) for k, v in kinds.items() if v[0] >= 15), key=lambda kv: (-(kv[1][1] / kv[1][0]), -kv[1][0]))[:3]
    best_op = max(ops, key=lambda o: o['ok'] / o['n'])
    txt = '📡 رادار فیلترینگ امروز\nموفقیت اتصال در ۲۴ ساعت گذشته، از گزارش‌های ناشناس برنامه‌های V2Fall\n\n' + '\n'.join(lines)
    if top:
        txt += '\n\n🏆 بهترین نوع اتصال امروز:\n' + '\n'.join(f"{fa(i + 1)}. {k} — {fa(pct(v[1], v[0]))}٪" for i, (k, v) in enumerate(top))
    txt += f"\n\n✨ بهترین اپراتور امروز: {ISP[best_op['a']]}"
    txt += '\n\n📡 رادار زنده: v2fall.com/radar\n🔒 فقط شمارنده برای هر اپراتور؛ نه IP، نه سرور، نه کاربر.\n\n#رادار_فیلترینگ #گزارش_روزانه\n\n' + SIGN
    return txt


def main():
    with urllib.request.urlopen(urllib.request.Request('https://dl.v2fall.com/radar?all=1', headers={'User-Agent': 'V2Fall-daily'}), timeout=30) as r:
        data = json.load(r)
    txt = build(data)
    print(txt or '(too few reports today: no post)')
    if txt and '--send' in sys.argv:
        tok = os.environ['TELEGRAM_BOT_TOKEN']
        body = urllib.parse.urlencode({'chat_id': os.environ.get('RADAR_CHAT') or '@v2fall', 'text': txt,
                                       'link_preview_options': json.dumps({'is_disabled': True})}).encode()
        with urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/sendMessage', body, timeout=30) as r:
            res = json.load(r)
        if not res.get('ok'):
            sys.exit('telegram: ' + str(res)[:200])


if __name__ == '__main__':
    main()
