// Filter Radar: what kind of connection works on which Iranian operator, from anonymous reports of V2Fall apps.
//   report: GET /radar?d=<base64url of {"v":1,"r":[[asn, cc, proto, transport, security, frag, ok, bucket], …]}>
//   read:   GET /radar?q=<asn>  → {n, k: [{k: "PROTO|transport|security|frag", n, ok}, …]}  (last 24 h, cached 10 min)
// The app sends reports only through its own VPN tunnel, so the address that reaches us is the VPN's exit,
// never the user's. Nothing per user is stored: no IP, no id, no server address, no SNI — only counters per
// (hour, operator, kind of connection). Rows older than 15 days are deleted (the app shows the last 7).

import { alertCheck, wideNote, calendar, siteReport, siteSummary, speedReport, speedSummary } from '../lib/radar.js';

const J = (o, s = 200, cache = 'no-store') => Response.json(o, { status: s, headers: { 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' } });
const RL = new Map();
function limited(key, n, sec) {
  const now = Date.now(), e = RL.get(key) || { t: now, n: 0 };
  if (now - e.t > sec * 1000) { e.t = now; e.n = 0; }
  e.n++; RL.set(key, e);
  if (RL.size > 20000) for (const [k, v] of RL) if (now - v.t > 3600000) RL.delete(k);
  return e.n > n;
}
let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS radar (h INTEGER NOT NULL, a INTEGER NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (h, a, k))').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS radar_a ON radar(a, h)').run();
  ready = true;
}
const PROTO = /^[A-Z0-9]{1,10}$/, LOW = /^[a-z0-9]{0,10}$/;
function rows(d) {
  let j; try { j = JSON.parse(atob(String(d).replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return []; }
  if (!j || j.v !== 1 || !Array.isArray(j.r)) return [];
  const out = [];
  for (const r of j.r.slice(0, 40)) {
    if (!Array.isArray(r) || r.length !== 8) continue;
    const [a, cc, p, t, s, f, ok, m] = r;
    if (!Number.isInteger(a) || a < 1 || a > 4294967295 || !PROTO.test(p) || !LOW.test(t) || !LOW.test(s) || (f !== 0 && f !== 1) || (ok !== 0 && ok !== 1) || !Number.isInteger(m) || m < 0 || m > 9) continue;
    if (typeof cc !== 'string' || !/^[A-Z]{0,2}$/.test(cc)) continue;
    out.push({ a, k: [p, t, s, f].join('|'), ok, m: ok ? Math.min(m, 4) : 0 });
  }
  return out;
}
export async function onRequestGet({ request, env, waitUntil }) {
  const db = env.STATS; if (!db) return J({ error: 'off' }, 503);
  const u = new URL(request.url), ip = request.headers.get('CF-Connecting-IP') || 'x';
  await init(db);
  const d = u.searchParams.get('d');
  if (d) {
    // the address is only held in memory for the rate limit (a VPN exit is shared by many people: generous)
    if (d.length > 6000 || limited('r:' + ip, 30, 3600)) return J({ error: 'too many' }, 429);
    const list = rows(d); if (!list.length) return J({ ok: 1, n: 0 });
    const h = Math.floor(Date.now() / 3600000);
    await db.batch(list.map(x => db.prepare('INSERT INTO radar (h, a, k, n, ok, ms) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(h, a, k) DO UPDATE SET n = n + 1, ok = ok + excluded.ok, ms = ms + excluded.ms').bind(h, x.a, x.k, x.ok, x.m)));
    if (Math.random() < 0.02) await db.prepare('DELETE FROM radar WHERE h < ?').bind(h - 24 * 15).run(); // two weeks for the history page
    // a sudden drop on one operator → a post in the channel (checked at most every 20 minutes, see lib/radar.js)
    if (waitUntil) waitUntil(alertCheck(env).catch(() => {}));
    return J({ ok: 1, n: list.length });
  }
  // site radar: report (?s=) and the public summary (?sites=1)
  const sd = u.searchParams.get('s');
  if (sd) {
    if (sd.length > 2000 || limited('s:' + ip, 20, 3600)) return J({ error: 'too many' }, 429);
    const n = await siteReport(db, sd);
    if (n && waitUntil) waitUntil(alertCheck(env).catch(() => {}));
    return J({ ok: 1, n });
  }
  // international speed index: report (?p=, a band only) and the public summary (?speed=1)
  const pd = u.searchParams.get('p');
  if (pd) {
    if (pd.length > 400 || limited('p:' + ip, 20, 3600)) return J({ error: 'too many' }, 429);
    return J({ ok: 1, n: await speedReport(db, pd) });
  }
  // early warning (lib/radar.js alertCheck): several operators worse together in the last hours, or null
  if (u.searchParams.get('w')) {
    if (limited('w:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    return J({ wide: await wideNote(env.CODES) }, 200, 'public, max-age=300');
  }
  if (u.searchParams.get('speed')) {
    const ck = new Request(u.origin + '/radar?speed=1'), hit6 = await caches.default.match(ck); if (hit6) return hit6;
    if (limited('v:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    const res = J(await speedSummary(db), 200, 'public, max-age=900');
    await caches.default.put(ck, res.clone()); return res;
  }
  if (u.searchParams.get('sites')) {
    const ck = new Request(u.origin + '/radar?sites=1'), hit5 = await caches.default.match(ck); if (hit5) return hit5;
    if (limited('t:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    const res = J(await siteSummary(db), 200, 'public, max-age=600');
    await caches.default.put(ck, res.clone()); return res;
  }
  // public page (v2fall.com/radar): every operator with enough reports in the last 24 h, best kinds first
  if (u.searchParams.get('all')) {
    const ck = new Request(u.origin + '/radar?all=1'), hit3 = await caches.default.match(ck); if (hit3) return hit3;
    if (limited('a:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    const now = Math.floor(Date.now() / 3600000);
    const r = await db.prepare('SELECT a, k, SUM(n) AS n, SUM(ok) AS ok, SUM(CASE WHEN h > ? THEN n ELSE 0 END) AS rn, SUM(CASE WHEN h > ? THEN ok ELSE 0 END) AS rok FROM radar WHERE h > ? GROUP BY a, k').bind(now - 2, now - 2, now - 24).all();
    const ops = new Map();
    for (const x of r.results || []) { const o = ops.get(x.a) || { a: x.a, n: 0, ok: 0, rn: 0, rok: 0, k: [] }; o.n += x.n; o.ok += x.ok; o.rn += x.rn; o.rok += x.rok; if (x.n >= 3) o.k.push({ k: x.k, n: x.n, ok: x.ok }); ops.set(x.a, o); }
    const list = [...ops.values()].filter(o => o.n >= 10).map(o => (o.k.sort((p, q) => (q.ok / q.n) - (p.ok / p.n) || q.n - p.n), o.k = o.k.slice(0, 6), o)).sort((p, q) => q.n - p.n).slice(0, 20);
    const res = J({ now, ops: list }, 200, 'public, max-age=600');
    await caches.default.put(ck, res.clone()); return res;
  }
  // disruption calendar: the hours of the day (Tehran time) this operator is usually worse, from 14 days
  const cA = parseInt(u.searchParams.get('cal') || '', 10);
  if (cA > 0) {
    const ck = new Request(u.origin + '/radar?cal=' + cA), hit4 = await caches.default.match(ck); if (hit4) return hit4;
    if (limited('c:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    const res = J(await calendar(db, cA), 200, 'public, max-age=3600');
    await caches.default.put(ck, res.clone()); return res;
  }
  // history: success per hour for the last 7 days (all kinds together) and per day for the kinds seen most
  const hA = parseInt(u.searchParams.get('h') || '', 10);
  if (hA > 0) {
    const ck = new Request(u.origin + '/radar?h=' + hA), hit2 = await caches.default.match(ck); if (hit2) return hit2;
    if (limited('h:' + ip, 30, 600)) return J({ error: 'too many' }, 429);
    const now = Math.floor(Date.now() / 3600000);
    const r = await db.prepare('SELECT h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE a = ? AND h > ? GROUP BY h ORDER BY h').bind(hA, now - 24 * 7).all();
    const res = J({ a: hA, now, hours: (r.results || []).map(x => [x.h, x.n, x.ok]) }, 200, 'public, max-age=1800');
    await caches.default.put(ck, res.clone()); return res;
  }
  const a = parseInt(u.searchParams.get('q') || '', 10);
  if (!(a > 0)) return J({ error: 'bad request' }, 400);
  const cache = caches.default, key = new Request(u.origin + '/radar?q=' + a);
  const hit = await cache.match(key); if (hit) return hit;
  if (limited('q:' + ip, 60, 600)) return J({ error: 'too many' }, 429);
  const h = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT k, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE a = ? AND h > ? GROUP BY k').bind(a, h - 24).all();
  const all = (r.results || []).map(x => ({ k: x.k, n: x.n, ok: x.ok }));
  const n = all.reduce((t, x) => t + x.n, 0);
  // at least 3 reports for a kind before it is shown; best first, then the most used
  const k = all.filter(x => x.n >= 3).sort((p, q) => (q.ok / q.n) - (p.ok / p.n) || q.n - p.n).slice(0, 12);
  // the last 2 hours against the 22 before them: a sudden drop is a disruption on this operator
  const rr = await db.prepare('SELECT SUM(CASE WHEN h > ? THEN n ELSE 0 END) AS rn, SUM(CASE WHEN h > ? THEN ok ELSE 0 END) AS rok, SUM(CASE WHEN h <= ? THEN n ELSE 0 END) AS pn, SUM(CASE WHEN h <= ? THEN ok ELSE 0 END) AS pok FROM radar WHERE a = ? AND h > ?').bind(h - 2, h - 2, h - 2, h - 2, a, h - 24).first();
  const recent = rr ? { rn: rr.rn || 0, rok: rr.rok || 0, pn: rr.pn || 0, pok: rr.pok || 0 } : null;
  const res = J({ a, n, k, recent, at: Date.now() }, 200, 'public, max-age=600');
  await cache.put(key, res.clone());
  return res;
}
