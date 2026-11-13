// GET /px/px/proxies.json and /px/tg/mtproto.json — the public proxy lists from the tgproxy branch, for phones in
// Iran where GitHub is filtered. GET /px/ch/<channel> — the MTProto proxy links in a public Telegram channel's
// preview page (t.me/s/<channel>), only the links (no post text). Everything cached at the edge for 10 minutes.
const FILES = { 'px/proxies.json': 1, 'tg/mtproto.json': 1 };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };
const LINK = /(?:tg:\/\/|https?:\/\/(?:t|telegram)\.me\/)proxy\?[^\s"'<>]+/gi;

function proxiesOf(html) {
  const out = [], seen = new Set();
  for (const m of html.match(LINK) || []) {
    const q = new URLSearchParams(m.split('?')[1].replace(/&amp;/g, '&'));
    const s = (q.get('server') || '').trim(), p = +q.get('port'), k = (q.get('secret') || '').trim();
    if (!/^[A-Za-z0-9.:[\]-]{1,253}$/.test(s) || !(p > 0 && p < 65536) || !k || seen.has(s + ':' + p)) continue;
    seen.add(s + ':' + p); out.push({ s, p, k });
  }
  return out.reverse().slice(0, 60); // newest posts last on the page
}

export async function onRequestGet({ params, waitUntil }) {
  const parts = [].concat(params.path || []), path = parts.join('/');
  const ch = parts[0] === 'ch' && parts.length === 2 && /^[A-Za-z0-9_]{4,40}$/.test(parts[1]) ? parts[1] : '';
  if (!FILES[path] && !ch) return new Response('not found', { status: 404, headers: CORS });
  const cache = caches.default, key = new Request('https://px.cache/' + path.toLowerCase());
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  let body;
  if (ch) {
    const r = await fetch('https://t.me/s/' + ch, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } });
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502, headers: CORS });
    body = JSON.stringify({ proxies: proxiesOf(await r.text()) });
  } else {
    const r = await fetch('https://raw.githubusercontent.com/meisamodin/v2fall-updates/tgproxy/' + path, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502, headers: CORS });
    body = await r.text();
  }
  const res = new Response(body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
