// GET /radar/feed → the Filter Radar's incidents as an Atom feed (Persian; ?en=1 English), for newsrooms, readers
// and channels: every sudden drop on a named operator that lasted 2 hours or more or hit several at once, and
// sites blocked / unblocked. Each entry links to its own page on v2fall.com.
import { incidents, ISP, SITES } from '../../lib/radar.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FA = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), en = !!u.searchParams.get('en'), ck = new Request(u.origin + '/radar/feed' + (en ? '?en=1' : ''));
  const hit = await caches.default.match(ck); if (hit) return hit;
  const db = env.STATS; if (!db) return new Response('off', { status: 503 });
  const { now, ev } = await incidents(db, env.CODES);
  const site = en ? 'https://v2fall.com/en' : 'https://v2fall.com', iso = h => new Date(h * 3600000).toISOString();
  const name = a => (ISP[a] || [])[en ? 1 : 0] || 'AS' + a, n = v => en ? String(v) : FA(v);
  const items = ev.filter(e => e.type !== 'drop' || e.wide || ((e.to ?? now) - e.from) >= 2).slice(0, 60).map(e => {
    if (e.type === 'drop') {
      const len = (e.to ?? now) - e.from, going = e.to == null;
      const title = en ? `${e.wide ? 'Nationwide disruption' : 'Disruption'} on ${name(e.a)}: ${e.base}% → ${e.low}% of connections working`
        : `${e.wide ? 'اختلال سراسری' : 'اختلال'} در اینترنت ${name(e.a)}: موفقیت اتصال از ${n(e.base)}٪ به ${n(e.low)}٪`;
      const body = en ? (going ? 'Still going.' : `Lasted about ${len} hour(s).`) : (going ? 'هنوز ادامه دارد.' : `حدود ${n(len)} ساعت طول کشید.`);
      return { id: `inc-${e.a}-${e.from}`, t: e.to ?? e.from, start: e.from, title, body, link: `${site}/radar/event?id=${e.a}-${e.from}` };
    }
    const s = SITES[e.s] ? (en ? SITES[e.s][0] : SITES[e.s][1]) : '';
    const title = en ? `${s} ${e.type === 'blocked' ? 'blocked' : 'unblocked'} on ${name(e.a)}` : `${s} روی ${name(e.a)} ${e.type === 'blocked' ? 'فیلتر شد' : 'باز شد'}`;
    return { id: `site-${e.a}-${e.s}-${e.h}`, t: e.h, start: e.h, title, body: title, link: `${site}/radar` };
  });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${en ? 'en' : 'fa'}">
<title>${en ? 'V2Fall Filter Radar — incidents' : 'رادار فیلترینگ V2Fall — اختلال‌ها'}</title>
<subtitle>${en ? 'Internet disruptions and blocks in Iran, from anonymous reports of V2Fall users' : 'اختلال و فیلترینگ اینترنت ایران، از گزارش ناشناس کاربران V2Fall'}</subtitle>
<link href="${site}/radar"/><link rel="self" href="${esc(u.origin + '/radar/feed' + (en ? '?en=1' : ''))}"/>
<id>https://v2fall.com/radar/feed${en ? '?en=1' : ''}</id><updated>${iso(now)}</updated><author><name>V2Fall</name></author>
${items.map(i => `<entry><id>https://v2fall.com/radar#${i.id}</id><title>${esc(i.title)}</title><link href="${esc(i.link)}"/><published>${iso(i.start)}</published><updated>${iso(i.t)}</updated><summary>${esc(i.body)}</summary></entry>`).join('\n')}
</feed>`;
  const res = new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' } });
  await caches.default.put(ck, res.clone()); return res;
}
