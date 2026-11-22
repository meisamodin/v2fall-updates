// Embeddable Filter Radar card for other sites and channels' pages:
//   <iframe src="https://dl.v2fall.com/widget?lang=fa&theme=dark" width="360" height="330" style="border:0"></iframe>
// options: lang=fa|en, theme=dark|light, a=<ASN> (one operator: its best kinds of connection too)
// Server-rendered HTML from the same 24 h counters as /radar (summary(), cached 5 min in memory and 10 min at the
// edge); no script, no cookie, nothing about the visitor is read or stored.
import { summary, ISP, label } from '../lib/radar.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FA = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const col = p => p >= 70 ? '#3DD68C' : p >= 40 ? '#F5C542' : '#F2555A';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), fa = u.searchParams.get('lang') !== 'en', light = u.searchParams.get('theme') === 'light';
  const one = +u.searchParams.get('a') || 0;
  const key = new Request(u.origin + '/widget?l=' + (fa ? 'fa' : 'en') + '&t=' + (light ? 'l' : 'd') + '&a=' + one);
  try { const hit = await caches.default.match(key); if (hit) return hit; } catch (e) {}
  let ops = [];
  try { ops = (await summary(env.STATS)).filter(o => ISP[o.a] && o.n >= 10); } catch (e) {}
  if (one) ops = ops.filter(o => o.a === one);
  const n = v => fa ? FA(v) : String(v), pc = v => fa ? FA(v) + '٪' : v + '%';
  const rows = ops.slice(0, 7).map(o => {
    const p = Math.round(o.ok * 100 / o.n), name = ISP[o.a][fa ? 0 : 1];
    const best = one ? (o.best || []).slice(0, 3).map(x => `<div class="k"><span dir="ltr">${esc(label(x.k))}</span><b style="color:${col(Math.round(x.ok * 100 / x.n))}">${pc(Math.round(x.ok * 100 / x.n))}</b></div>`).join('') : '';
    return `<div class="r"><span class="nm">${esc(name)}</span><div class="bar"><i style="width:${Math.max(4, p)}%;background:${col(p)}"></i></div><b style="color:${col(p)}">${pc(p)}</b></div>${best}`;
  }).join('');
  const total = ops.reduce((s, o) => s + o.n, 0);
  const T = fa
    ? { h: 'رادار فیلترینگ', s: 'موفقیت اتصال در ۲۴ ساعت گذشته', none: 'هنوز گزارش کافی نیامده', f: 'گزارش ناشناس کاربران V2Fall', more: 'جزئیات کامل' }
    : { h: 'Filter Radar', s: 'Connections that worked, last 24 h', none: 'Not enough reports yet', f: 'anonymous reports of V2Fall users', more: 'Full details' };
  const C = light ? { bg: '#FFFFFF', card: '#F4F1EA', text: '#1D1A16', muted: '#6B6358', line: 'rgba(0,0,0,.08)', bar: '#E6E0D5' }
                  : { bg: '#0C0806', card: '#181412', text: '#EDE7DB', muted: '#A79C8B', line: 'rgba(237,231,221,.09)', bar: '#241D17' };
  const html = `<!doctype html><html lang="${fa ? 'fa' : 'en'}" dir="${fa ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.h} · V2Fall</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0}html,body{background:${C.bg};color:${C.text};font-family:Vazirmatn,Tahoma,sans-serif}
.w{padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-height:100vh}
.h{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.h b{font-size:16px;font-weight:800}.h b span{color:#F0994B}.h small{font-size:11px;color:${C.muted}}
.r{display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:10px;font-size:13px;font-weight:700}.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:9px;border-radius:99px;background:${C.bar};overflow:hidden}.bar i{display:block;height:100%;border-radius:99px}.r b{text-align:end;font-size:13px}
.k{display:flex;justify-content:space-between;font-size:12px;color:${C.muted};padding-inline-start:12px}
.none{font-size:13px;color:${C.muted};padding:18px 0;text-align:center}
.f{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${C.muted};border-top:1px solid ${C.line};padding-top:9px}
.f a{color:#F0994B;text-decoration:none;font-weight:700}</style></head><body><div class="w">
<div class="h"><b>📡 ${fa ? 'رادار <span>فیلترینگ</span>' : 'Filter <span>Radar</span>'}</b><small>${T.s}</small></div>
${rows || `<div class="none">${T.none}</div>`}
<div class="f"><span>${T.f}${total ? ' · ' + n(total) : ''}</span><a href="https://v2fall.com/radar" target="_blank" rel="noopener">${T.more} ${fa ? "←" : "→"} V2Fall</a></div>
</div></body></html>`;
  const res = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors *" } });
  try { await caches.default.put(key, res.clone()); } catch (e) {}
  return res;
}
