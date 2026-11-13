// GET /px/px/proxies.json and /px/tg/mtproto.json — the public proxy lists from the tgproxy branch, for phones in
// Iran where GitHub is filtered. Only these two files; cached at the edge for 10 minutes.
const FILES = { 'px/proxies.json': 1, 'tg/mtproto.json': 1 };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };

export async function onRequestGet({ params, request, waitUntil }) {
  const path = [].concat(params.path || []).join('/');
  if (!FILES[path]) return new Response('not found', { status: 404, headers: CORS });
  const cache = caches.default, key = new Request('https://px.cache/' + path);
  let hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const r = await fetch('https://raw.githubusercontent.com/meisamodin/v2fall-updates/tgproxy/' + path, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) return new Response('upstream ' + r.status, { status: 502, headers: CORS });
  const body = await r.text();
  const res = new Response(body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
