// «اینترنت برای ایران» relay broker (like Snowflake's, ours): pairs a client in Iran with a volunteer outside.
//   client:    POST /rb/offer {sdp}        → {id}
//              POST /rb/answer {id}        → {sdp} | {wait:1} | {none:1}   (held up to ~20 s)
//   volunteer: POST /rb/poll {}            → {id, sdp} | {next}             (held up to ~20 s)
//              POST /rb/ans {id, sdp}      → {ok}
//   anyone:    GET  /rb/ping               → {ok}
//              POST /rb/ice                → {ice: [{urls, username, credential}]}  TURN relays (may be empty)
//              GET  /rb/stats              → {vol}   volunteers online
// Rows live in D1 (env.STATS) for two minutes at most — KV's free tier allows only 1000 writes a day.
// No IPs are stored. Rate limits are in memory per isolate (no storage writes), like /tgapi.
//
// Request budget (Workers free plan: 100k requests a day for every function of the site together):
// each volunteer is told how long to rest between polls, so that all volunteers together make about
// RB_RATE polls a second (default 0.35 ≈ 30k a day) however many there are. One poll waits up to 20 s,
// so about RB_RATE × 20 volunteers are always listening and an offer is still picked up in ~1.5 s.
// Users in Iran back off when nobody is online (`vol` in every "none" answer).
//
// Private sharing: a volunteer may help only the people holding their code. The helpers send `room`
// = a hash of that code (the code itself never reaches us); offers and polls only meet inside a room.
// Private volunteers rest at most PRIV_REST s, and their offers wait PRIV_TTL, so a family member is not
// kept waiting behind the public budget.

const J = (o, s = 200) => Response.json(o, { status: s, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
const RL = new Map();
function limited(key, n, sec) {
  const now = Date.now(), e = RL.get(key) || { t: now, n: 0 };
  if (now - e.t > sec * 1000) { e.t = now; e.n = 0; }
  e.n++; RL.set(key, e);
  if (RL.size > 20000) for (const [k, v] of RL) if (now - v.t > 600000) RL.delete(k);
  return e.n > n;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OFFER_TTL = 12000;  // a volunteer must pick an offer up within this
const ROW_TTL = 120000;   // rows are deleted after this
const HOLD = 20000;       // how long one request may wait
const PRIV_TTL = 75000, PRIV_REST = 35;
const okRoom = r => typeof r === 'string' && /^[0-9a-f]{32}$/.test(r) ? r : '';
const VOL_TTL = 120;      // seconds a volunteer counts as online after its poll (+ its rest time)
let ready = false;
let volCache = { n: 0, at: 0 };
async function volunteers(db, room) {
  if (room) { const r = await db.prepare('SELECT COUNT(*) AS n FROM rbv WHERE exp > ? AND room = ?').bind(Math.floor(Date.now() / 1000), room).first(); return (r && r.n) || 0; }
  if (Date.now() - volCache.at < 30000) return volCache.n;
  const r = await db.prepare("SELECT COUNT(*) AS n FROM rbv WHERE exp > ? AND room = ''").bind(Math.floor(Date.now() / 1000)).first();
  volCache = { n: (r && r.n) || 0, at: Date.now() };
  return volCache.n;
}
// seconds a volunteer rests after a poll that found nothing
function rest(env, n) {
  const rate = Math.max(0.05, +env.RB_RATE || 0.35);
  return Math.max(0, Math.min(3600, Math.ceil(n / rate) - HOLD / 1000));
}
async function init(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS rb (id TEXT PRIMARY KEY, t INTEGER NOT NULL, st INTEGER NOT NULL DEFAULT 0, offer TEXT, ans TEXT, tk INTEGER)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS rb_st ON rb(st, t)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS rbv (vid TEXT PRIMARY KEY, exp INTEGER NOT NULL)').run();
  // private rooms (added later: tables made before have no column yet)
  for (const t of ['rb', 'rbv']) { try { await db.prepare(`ALTER TABLE ${t} ADD COLUMN room TEXT NOT NULL DEFAULT ''`).run(); } catch (e) {} }
  await db.prepare('CREATE INDEX IF NOT EXISTS rb_room ON rb(st, room, t)').run();
  ready = true;
}
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
const okSdp = s => typeof s === 'string' && s.length > 20 && s.length < 16000 && /^v=0/.test(s);

let turnCache = { ice: [], at: 0 }, turnErr = '';
// Monthly allowance: Cloudflare's free TURN tier is 1000 GB a month. Usage is read from the GraphQL
// analytics (cached 10 min); at TURN_CAP_GB (default 900) no more relays are handed out until the
// month turns, so the card on the account is never charged. Unknown usage counts as over the cap.
let usageCache = { gb: null, at: 0 };
async function turnUsedGB(env) {
  if (Date.now() - usageCache.at < 600e3) return usageCache.gb;
  let gb = null;
  try {
    const d = new Date(), from = d.toISOString().slice(0, 8) + '01', to = d.toISOString().slice(0, 10);
    const q = `query { viewer { accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) { callsTurnUsageAdaptiveGroups(limit: 1, filter: {date_geq: "${from}", date_leq: "${to}", keyId: "${String(env.CF_TURN_KEY_ID).trim()}"}) { sum { egressBytes ingressBytes } } } } }`;
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    const j = await r.json();
    const acc = j && j.data && j.data.viewer && j.data.viewer.accounts && j.data.viewer.accounts[0];
    if (acc) {
      const g = (acc.callsTurnUsageAdaptiveGroups || [])[0];
      const s = g ? g.sum : { egressBytes: 0, ingressBytes: 0 };
      gb = ((s.egressBytes || 0) + (s.ingressBytes || 0)) / 1e9;
    }
  } catch (e) {}
  usageCache = { gb, at: Date.now() };
  return gb;
}
async function turnStatus(env) {
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_KEY_TOKEN) return { on: false, why: 'no key' };
  const used = await turnUsedGB(env), cap = +(env.TURN_CAP_GB || 900);
  if (used == null) return { on: false, why: 'usage unknown' };
  return { on: used < cap, used: Math.round(used * 10) / 10, cap };
}
async function turnServers(env) {
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_KEY_TOKEN) return [];
  if (!(await turnStatus(env)).on) return [];
  if (Date.now() - turnCache.at < 3600e3 && turnCache.ice.length) return turnCache.ice;
  try {
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + String(env.CF_TURN_KEY_ID).trim() + '/credentials/generate-ice-servers', {
      method: 'POST', headers: { Authorization: 'Bearer ' + String(env.CF_TURN_KEY_TOKEN).trim(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 43200 })
    });
    const txt = await r.text(); let j = {};
    try { j = JSON.parse(txt); } catch (e) {}
    turnErr = r.ok ? '' : 'id length ' + String(env.CF_TURN_KEY_ID).trim().length + ', HTTP ' + r.status + ' ' + txt.slice(0, 120).replace(/[A-Za-z0-9_-]{20,}/g, '…');
    const list = [].concat(j.iceServers || []).filter(x => x && x.urls && x.username)
      .map(x => ({ urls: [].concat(x.urls).filter(u => /^turns?:/.test(u) && !/:53(\?|$)/.test(u)), username: x.username, credential: x.credential })).filter(x => x.urls.length);
    // Cloudflare also answers on the alternate ports 80 (TCP) and 443 (TLS): in Iran 3478/5349 are often
    // closed, 443 almost never
    for (const x of list) {
      if (x.urls.some(u => u.startsWith('turn:turn.cloudflare.com'))) x.urls.push('turn:turn.cloudflare.com:80?transport=tcp');
      if (x.urls.some(u => u.startsWith('turns:turn.cloudflare.com'))) x.urls.push('turns:turn.cloudflare.com:443?transport=tcp');
      x.urls = [...new Set(x.urls)];
    }
    if (list.length) turnCache = { ice: list, at: Date.now() };
    return list;
  } catch (e) { turnErr = String(e).slice(0, 120); return turnCache.ice; }
}

async function handle({ request, env, params }) {
  const db = env.STATS; if (!db) return J({ error: 'off' }, 503);
  const a = params.action, ip = request.headers.get('CF-Connecting-IP') || 'x';
  if (a === 'ping') return J({ ok: 1, v: 3 });
  // TURN relay servers (Cloudflare Realtime TURN, free 1000 GB/month) for when the two sides cannot reach
  // each other directly — the usual case behind Iranian mobile networks. Short-lived credentials,
  // shared by every request of this isolate for an hour (they live 12 hours).
  if (a === 'ice') {
    if (limited('i:' + ip, 30, 60)) return J({ error: 'too many' }, 429);
    const ice = await turnServers(env);
    return J({ ice, turn: Object.assign(await turnStatus(env), ice.length ? {} : { err: turnErr }) });
  }
  if (a === 'stats') {
    if (limited('s:' + ip, 20, 60)) return J({ error: 'too many' }, 429);
    await init(db);
    return J({ vol: await volunteers(db, okRoom(new URL(request.url).searchParams.get('room') || '')) });
  }
  if (request.method !== 'POST') return J({ error: 'method' }, 405);
  let j = {}; try { j = JSON.parse((await request.text()).slice(0, 20000) || '{}'); } catch (e) { return J({ error: 'bad' }, 400); }
  await init(db);
  const now = Date.now();

  if (a === 'offer') {
    if (limited('o:' + ip, 30, 60)) return J({ error: 'too many' }, 429);
    if (!okSdp(j.sdp)) return J({ error: 'bad' }, 400);
    const id = rid();
    await db.prepare('INSERT INTO rb (id, t, st, offer, room) VALUES (?, ?, 0, ?, ?)').bind(id, now, j.sdp, okRoom(j.room)).run();
    if (Math.random() < 0.2) await db.prepare('DELETE FROM rb WHERE t < ?').bind(now - ROW_TTL).run();
    return J({ id });
  }

  if (a === 'answer') {
    if (limited('a:' + ip, 60, 60)) return J({ error: 'too many' }, 429);
    const id = String(j.id || ''); if (!/^[0-9a-f]{24}$/.test(id)) return J({ error: 'bad' }, 400);
    const end = now + HOLD;
    for (;;) {
      const r = await db.prepare('SELECT t, st, ans, tk, room FROM rb WHERE id = ?').bind(id).first();
      if (!r) return J({ none: 1, vol: await volunteers(db) });
      const ttl = r.room ? PRIV_TTL : OFFER_TTL;
      if (r.st === 2 && r.ans) { await db.prepare('DELETE FROM rb WHERE id = ?').bind(id).run(); return J({ sdp: r.ans }); }
      if (r.st === 0 && Date.now() - r.t > ttl) { await db.prepare('DELETE FROM rb WHERE id = ? AND st = 0').bind(id).run(); return J({ none: 1, vol: await volunteers(db, r.room) }); }
      // a volunteer that took the offer answers within seconds; one that vanished is not waited for
      if (r.st === 1 && Date.now() - (r.tk || r.t) > 10000) { await db.prepare('DELETE FROM rb WHERE id = ?').bind(id).run(); return J({ none: 1, vol: await volunteers(db) }); }
      if (Date.now() > end) return J({ wait: 1 });
      await sleep(r.st === 1 ? 400 : 900);
    }
  }

  if (a === 'poll') {
    if (limited('p:' + ip, 40, 60)) return J({ error: 'too many', next: 60 }, 429);
    const end = now + Math.min(HOLD, Math.max(0, +j.hold || HOLD));
    const room = okRoom(j.room);
    const n = await volunteers(db), next = room ? Math.min(PRIV_REST, rest(env, n)) : rest(env, n);
    // the volunteer is online until its next poll is due (one write per poll, and polls are budgeted)
    const vid = /^[0-9a-f]{16,32}$/.test(String(j.vid || '')) ? j.vid : null;
    if (vid) {
      await db.prepare('INSERT INTO rbv (vid, exp, room) VALUES (?, ?, ?) ON CONFLICT(vid) DO UPDATE SET exp = excluded.exp, room = excluded.room').bind(vid, Math.floor(now / 1000) + next + VOL_TTL, room).run();
      if (n === 0) volCache.at = 0; // the first volunteer shows up at once
      if (Math.random() < 0.02) await db.prepare('DELETE FROM rbv WHERE exp < ?').bind(Math.floor(now / 1000) - 600).run();
    }
    for (;;) {
      const t = Date.now();
      const r = await db.prepare('UPDATE rb SET st = 1, tk = ? WHERE id = (SELECT id FROM rb WHERE st = 0 AND room = ? AND t > ? ORDER BY t LIMIT 1) AND st = 0 RETURNING id, offer')
        .bind(t, room, t - (room ? PRIV_TTL : OFFER_TTL) + 2000).first();
      if (r && r.id) return J({ id: r.id, sdp: r.offer });
      if (Date.now() > end) return J({ next: Math.max(1, next), vol: room ? undefined : n });
      await sleep(1500);
    }
  }

  if (a === 'ans') {
    if (limited('n:' + ip, 60, 60)) return J({ error: 'too many' }, 429);
    const id = String(j.id || ''); if (!/^[0-9a-f]{24}$/.test(id) || !okSdp(j.sdp)) return J({ error: 'bad' }, 400);
    const r = await db.prepare('UPDATE rb SET st = 2, ans = ? WHERE id = ? AND st = 1').bind(j.sdp, id).run();
    return J({ ok: !!(r && r.meta && r.meta.changes) });
  }
  return J({ error: 'unknown' }, 404);
}

export const onRequest = ctx => handle(ctx).catch(e => J({ error: 'server' }, 500));
