#!/usr/bin/env python3
"""Weekly Filter Radar post (Fridays): each main operator's last 7 days, its usual worst hours (14-day pattern) and
the kinds of connection that worked best, as one picture card plus a short text, in @v2fall.
  python3 tools/radar_weekly.py            print the text, write radar_week.png
  python3 tools/radar_weekly.py --send     post it (TELEGRAM_BOT_TOKEN, RADAR_CHAT)
Needs RADAR_FONT (file:// URL of a Vazirmatn woff2) for the picture; without it the post is text only."""
import datetime, html as H, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from radar_daily import ISP, label, pct, fa, jalali, MONTHS, render_png, tg_photo  # noqa: E402

API = 'https://dl.v2fall.com/radar'
MAIN = [197207, 44244, 57218, 58224, 31549, 43754, 16322, 50810, 56402]


def get(q):
    try:
        with urllib.request.urlopen(urllib.request.Request(f'{API}?{q}', headers={'User-Agent': 'V2Fall-weekly'}), timeout=25) as r:
            return json.load(r)
    except Exception as e:
        print('fetch failed', q, e)
        return None


def collect():
    """per operator: 7-day reports and success, the usual worst window, the best kinds (24 h)"""
    allops = {o['a']: o for o in ((get('all=1') or {}).get('ops') or [])}
    out = []
    for a in MAIN:
        h = get(f'h={a}')
        if not h or not h.get('hours'):
            continue
        now = h['now']
        week = [x for x in h['hours'] if x[0] > now - 24 * 7]
        n, ok = sum(x[1] for x in week), sum(x[2] for x in week)
        if n < 40:
            continue
        c = get(f'cal={a}') or {}
        win = (c.get('wins') or [None])[0] if c.get('enough') else None
        kinds = sorted((k for k in (allops.get(a, {}).get('k') or []) if k['n'] >= 5), key=lambda k: (-(k['ok'] / k['n']), -k['n']))[:2]
        out.append({'a': a, 'n': n, 'p': pct(ok, n), 'win': win, 'kinds': kinds})
    return sorted(out, key=lambda o: -o['n'])


def text(ops):
    t = datetime.datetime.utcnow() + datetime.timedelta(hours=3, minutes=30)
    jy, jm, jd = jalali(t.year, t.month, t.day)
    lines = [f'📡 گزارش هفتگی رادار فیلترینگ — هفته‌ای که {fa(jd)} {MONTHS[jm - 1]} تمام شد', '']
    for o in ops:
        dot = '🟢' if o['p'] >= 70 else '🟡' if o['p'] >= 40 else '🔴'
        line = f"{dot} {ISP[o['a']]}: {fa(o['p'])}٪ اتصال‌ها وصل شد"
        if o['win']:
            line += f"؛ معمولاً ساعت {fa(o['win']['from'])} تا {fa(o['win']['to'])} بدتر است"
        lines.append(line)
        if o['kinds']:
            lines.append('   بهترین: ' + '، '.join(label(k['k']) for k in o['kinds']))
    best = max(ops, key=lambda o: o['p'])
    worst = min(ops, key=lambda o: o['p'])
    if best is not worst:
        lines += ['', f"⭐ بهترین اپراتور هفته: {ISP[best['a']]} · سخت‌ترین: {ISP[worst['a']]}"]
    lines += ['', f"از {fa(sum(o['n'] for o in ops))} گزارش ناشناس کاربران V2Fall", '📡 رادار زنده: v2fall.com/radar', '⬇️ v2fall.com · 🤖 @v2fallbot']
    return '\n'.join(lines)


def card(ops, font):
    t = datetime.datetime.utcnow() + datetime.timedelta(hours=3, minutes=30)
    jy, jm, jd = jalali(t.year, t.month, t.day)
    col = lambda p: '#3DD68C' if p >= 70 else '#F5C542' if p >= 40 else '#F2555A'
    rows = ''.join(
        f'<div class="r"><div class="t"><b>{H.escape(ISP[o["a"]])}</b>'
        + (f'<small>بدترین ساعت‌ها: {fa(o["win"]["from"])} تا {fa(o["win"]["to"])}</small>' if o['win'] else '<small>الگوی مشخصی دیده نشد</small>')
        + f'</div><div class="b"><i style="width:{max(3, o["p"])}%;background:{col(o["p"])}"></i></div><em style="color:{col(o["p"])}">{fa(o["p"])}٪</em></div>'
        for o in ops[:7])
    return f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{{font-family:V;src:url('{font}') format('woff2');font-weight:100 900}}
*{{box-sizing:border-box;margin:0}}
body{{width:1080px;height:1350px;background:#0C0806;color:#EDE7DB;font-family:V,Tahoma,sans-serif;padding:80px 76px;display:flex;flex-direction:column;gap:38px}}
.h{{display:flex;flex-direction:column;gap:12px}} h1{{font-size:72px;font-weight:900;line-height:1.15}} h1 span{{color:#F0994B}}
.d{{font-size:32px;color:#A79C8B}} .s{{font-size:31px;color:#A79C8B;margin-top:-22px}}
.c{{background:#181412;border:2px solid rgba(237,231,221,.09);border-radius:40px;padding:40px 46px;display:flex;flex-direction:column;gap:32px}}
.r{{display:grid;grid-template-columns:280px 1fr 120px;align-items:center;gap:26px}}
.t{{display:flex;flex-direction:column;gap:4px}} .t b{{font-size:40px;font-weight:800}} .t small{{font-size:24px;color:#A79C8B}}
.b{{height:26px;border-radius:99px;background:#241D17;overflow:hidden}} .b i{{display:block;height:100%;border-radius:99px}}
em{{font-style:normal;font-size:44px;font-weight:900;text-align:left}}
.f{{margin-top:auto;display:flex;justify-content:space-between;font-size:32px;color:#A79C8B}} .f b{{color:#EDE7DB}}
</style></head><body>
<div class="h"><h1>گزارش <span>هفتگی</span> رادار</h1><div class="d">هفته‌ای که {fa(jd)} {MONTHS[jm - 1]} {fa(jy)} تمام شد</div></div>
<div class="s">درصد اتصال‌هایی که در ۷ روز گذشته وصل شد، روی هر اپراتور</div>
<div class="c">{rows}</div>
<div class="f"><b dir="ltr">v2fall.com/radar</b><span dir="ltr">@v2fall</span></div>
</body></html>"""


def main():
    ops = collect()
    if len(ops) < 2:
        print('too few operators with reports this week; no post')
        return
    txt = text(ops)
    print(txt)
    font = os.environ.get('RADAR_FONT', '')
    png = render_png(card(ops, font)) if font else None
    if png:
        os.replace(png, 'radar_week.png'); png = os.path.abspath('radar_week.png')
        from pathlib import Path; png = Path(png)
    print('picture:', png or 'none')
    if '--send' not in sys.argv:
        return
    tok, chat = os.environ['TELEGRAM_BOT_TOKEN'], os.environ.get('RADAR_CHAT') or '@v2fall'
    if png and len(txt) <= 1000:
        r = tg_photo(tok, chat, png, txt)
        if r.get('ok'):
            return
    if png:
        tg_photo(tok, chat, png, '📡 گزارش هفتگی رادار فیلترینگ')
    body = urllib.parse.urlencode({'chat_id': chat, 'text': txt, 'disable_web_page_preview': 'true'}).encode()
    with urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/sendMessage', body, timeout=30) as r:
        print(json.load(r).get('ok'))


if __name__ == '__main__':
    import urllib.parse  # noqa: F401
    main()
