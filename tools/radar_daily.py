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
     'DNSTT': 'DNSTT', 'MDV': 'MasterDNS', 'TOR': 'Tor', 'PSI': 'Psiphon', 'RELAY': 'Ashflake', 'NAIVE': 'NaiveProxy', 'XRAY': 'Xray'}
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


def build(data, cals=None):
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
    # disruption calendar: the hours each operator is usually worse (14 days), only with enough reports
    risky = []
    for o in ops[:8]:
        c = (cals or {}).get(o['a']) or {}
        w = (c.get('wins') or [None])[0]
        if c.get('enough') and w:
            risky.append(f"• {ISP[o['a']]}: ساعت {fa(w['from'])} تا {fa(w['to'])}")
    # international speed index: the usual band today, and a word when clearly slower than last week
    BANDS = ['زیر ۲۵۰ کیلوبیت', '۰.۲۵ تا ۱ مگابیت', '۱ تا ۴ مگابیت', '۴ تا ۱۶ مگابیت', 'بیشتر از ۱۶ مگابیت']
    sp = [o for o in ((cals or {}).get('speed') or []) if o.get('a') in ISP and o.get('med') is not None and o.get('n', 0) >= 5]
    if sp:
        txt += '\n\n🌐 سرعت بین‌الملل معمول امروز:\n' + '\n'.join(f"• {ISP[o['a']]}: {BANDS[o['med']]}" + (' 🐢 کندتر از هفتهٔ پیش' if o.get('worse') else '') for o in sp[:6])
    if risky:
        txt += '\n\n⏰ ساعت‌های پرخطر معمول (دو هفتهٔ گذشته):\n' + '\n'.join(risky)
    txt += '\n\n📡 رادار زنده: v2fall.com/radar\n🔒 فقط شمارنده برای هر اپراتور؛ نه IP، نه سرور، نه کاربر.\n\n#رادار_فیلترینگ #گزارش_روزانه\n\n' + SIGN
    return txt


def jalali(y, m, d):
    """Gregorian → Jalali (the usual arithmetic algorithm)."""
    g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = y + 1 if m > 2 else y
    days = 355666 + 365 * y + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + d + g[m - 1]
    jy = -1595 + 33 * (days // 12053); days %= 12053
    jy += 4 * (days // 1461); days %= 1461
    if days > 365:
        jy += (days - 1) // 365; days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']


def card_html(data, font):
    """The day's radar as a 1080×1350 picture (rendered by headless Chrome): one bar per operator, the best kinds."""
    import datetime, html as H
    ops = [o for o in data.get('ops', []) if o.get('a') in ISP and o.get('n', 0) >= 20]
    if len(ops) < 2 or sum(o['n'] for o in ops) < 80:
        return ''
    ops.sort(key=lambda o: -o['n'])
    kinds = {}
    for o in ops:
        for x in o.get('k', []):
            e = kinds.setdefault(label(x['k']), [0, 0]); e[0] += x['n']; e[1] += x['ok']
    top = sorted(((k, v) for k, v in kinds.items() if v[0] >= 15), key=lambda kv: (-(kv[1][1] / kv[1][0]), -kv[1][0]))[:3]
    t = datetime.datetime.utcnow() + datetime.timedelta(hours=3, minutes=30)
    jy, jm, jd = jalali(t.year, t.month, t.day)
    col = lambda p: '#3DD68C' if p >= 70 else '#F5C542' if p >= 40 else '#F2555A'
    rows = ''.join(
        f'<div class="r"><span class="n">{H.escape(ISP[o["a"]])}</span><div class="b"><i style="width:{max(3, pct(o["ok"], o["n"]))}%;background:{col(pct(o["ok"], o["n"]))}"></i></div>'
        f'<b style="color:{col(pct(o["ok"], o["n"]))}">{fa(pct(o["ok"], o["n"]))}٪</b></div>' for o in ops[:7])
    tops = ''.join(f'<div class="k"><span class="i">{fa(i + 1)}</span><span dir="ltr">{H.escape(k)}</span><b>{fa(pct(v[1], v[0]))}٪</b></div>' for i, (k, v) in enumerate(top))
    return f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{{font-family:V;src:url('{font}') format('woff2');font-weight:100 900}}
*{{box-sizing:border-box;margin:0}}
body{{width:1080px;height:1350px;background:#0C0806;color:#EDE7DB;font-family:V,Tahoma,sans-serif;padding:84px 80px;display:flex;flex-direction:column;gap:44px}}
.h{{display:flex;justify-content:space-between;align-items:flex-end}}
h1{{font-size:76px;font-weight:900;line-height:1.1}} h1 span{{color:#F0994B}}
.d{{font-size:34px;color:#A79C8B;text-align:left}}
.s{{font-size:32px;color:#A79C8B;margin-top:-26px}}
.c{{background:#181412;border:2px solid rgba(237,231,221,.09);border-radius:40px;padding:44px 48px;display:flex;flex-direction:column;gap:30px}}
.r{{display:grid;grid-template-columns:230px 1fr 120px;align-items:center;gap:28px;font-size:40px;font-weight:700}}
.b{{height:26px;border-radius:99px;background:#241D17;overflow:hidden}} .b i{{display:block;height:100%;border-radius:99px}}
.r b{{text-align:left;font-size:42px}}
h2{{font-size:38px;color:#F8B26E;font-weight:800}}
.k{{display:flex;align-items:center;gap:22px;font-size:36px;font-weight:700}} .k b{{margin-right:auto;color:#3DD68C}}
.i{{width:56px;height:56px;border-radius:18px;background:rgba(240,153,75,.16);color:#F8B26E;display:flex;align-items:center;justify-content:center}}
.f{{margin-top:auto;display:flex;justify-content:space-between;font-size:32px;color:#A79C8B}} .f b{{color:#EDE7DB}}
</style></head><body>
<div class="h"><div><h1>رادار <span>فیلترینگ</span></h1></div><div class="d">{fa(jd)} {MONTHS[jm - 1]} {fa(jy)}</div></div>
<div class="s">موفقیت اتصال در ۲۴ ساعت گذشته، روی هر اپراتور</div>
<div class="c">{rows}</div>
{f'<div class="c"><h2>بهترین نوع اتصال امروز</h2>{tops}</div>' if tops else ''}
<div class="f"><b dir="ltr">v2fall.com/radar</b><span dir="ltr">@v2fall</span></div>
</body></html>"""


def render_png(htmltext):
    """headless Chrome on the runner → radar.png; None when it cannot (then the post goes out as text only)."""
    import subprocess, shutil, pathlib
    exe = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not exe or not htmltext:
        return None
    hp = pathlib.Path('radar_card.html').resolve(); hp.write_text(htmltext, encoding='utf-8')
    out = pathlib.Path('radar.png').resolve()
    try:
        subprocess.run([exe, '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--window-size=1080,1350', '--virtual-time-budget=3000', f'--screenshot={out}', hp.as_uri()], check=True, timeout=90,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print('render failed:', e); return None
    return out if out.exists() and out.stat().st_size > 10000 else None


def tg_photo(tok, chat, png, caption):
    import uuid
    bnd = uuid.uuid4().hex
    parts = []
    for k, v in (('chat_id', chat), ('caption', caption)):
        parts.append(f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{bnd}\r\nContent-Disposition: form-data; name="photo"; filename="radar.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + png.read_bytes() + b'\r\n')
    parts.append(f'--{bnd}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{tok}/sendPhoto', b''.join(parts), {'Content-Type': f'multipart/form-data; boundary={bnd}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    with urllib.request.urlopen(urllib.request.Request('https://dl.v2fall.com/radar?all=1', headers={'User-Agent': 'V2Fall-daily'}), timeout=30) as r:
        data = json.load(r)
    cals = {}
    for o in data.get('ops', [])[:10]:
        if o.get('a') in ISP:
            try:
                with urllib.request.urlopen(urllib.request.Request(f"https://dl.v2fall.com/radar?cal={o['a']}", headers={'User-Agent': 'V2Fall-daily'}), timeout=20) as r:
                    cals[o['a']] = json.load(r)
            except Exception:
                pass
    try:
        with urllib.request.urlopen(urllib.request.Request('https://dl.v2fall.com/radar?speed=1', headers={'User-Agent': 'V2Fall-daily'}), timeout=20) as r:
            cals['speed'] = json.load(r).get('ops', [])
    except Exception:
        pass
    txt = build(data, cals)
    print(txt or '(too few reports today: no post)')
    font = os.environ.get('RADAR_FONT', '')
    png = render_png(card_html(data, font)) if txt and font else None
    print('picture:', png or 'none')
    if txt and '--send' in sys.argv:
        tok = os.environ['TELEGRAM_BOT_TOKEN']; chat = os.environ.get('RADAR_CHAT') or '@v2fall'
        if png:
            try:
                # the whole post as the picture's caption when it fits (1024), else the picture with the title first
                res = tg_photo(tok, chat, png, txt if len(txt) <= 1000 else '📡 رادار فیلترینگ امروز')
                if res.get('ok') and len(txt) <= 1000:
                    return
            except Exception as e:
                print('photo failed:', e)
        body = urllib.parse.urlencode({'chat_id': chat, 'text': txt,
                                       'link_preview_options': json.dumps({'is_disabled': True})}).encode()
        with urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/sendMessage', body, timeout=30) as r:
            res = json.load(r)
        if not res.get('ok'):
            sys.exit('telegram: ' + str(res)[:200])


if __name__ == '__main__':
    main()
