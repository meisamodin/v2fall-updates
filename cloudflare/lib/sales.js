// Sales links with buyer status (seller's choice when making the code, and the buyer agrees in the app before
// anything is sent): which devices activated a code, how much data each used, and when it was last connected.
// Stored per short code in D1. Nothing about what the buyer opens: only the code, a device hash, a byte count
// and times. The seller reads it with the admin key the code was made with (only its hash is kept here).
export const SALE_DEV_MAX = 30;     // devices tracked per code
export const LIVE_SEC = 40 * 60;    // a buyer counts as online for this long after a report sent while connected
const KEEP_SEC = 7 * 86400;         // rows of a finished code are kept this long, then removed

let ready = null;
export async function salesDb(env) {
  const db = env && env.STATS; if (!db) return null;
  if (!ready) ready = (async () => {
    await db.prepare('CREATE TABLE IF NOT EXISTS sale_meta (id TEXT PRIMARY KEY, adm TEXT NOT NULL, exp INTEGER, created INTEGER, creator TEXT)').run();
    await db.prepare('CREATE TABLE IF NOT EXISTS sale_dev (id TEXT NOT NULL, dev TEXT NOT NULL, first INTEGER, last INTEGER, used INTEGER DEFAULT 0, live INTEGER DEFAULT 0, PRIMARY KEY (id, dev))').run();
  })().catch(e => { ready = null; throw e; });
  await ready;
  return db;
}

export async function sha256hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
export const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
export const now = () => Math.floor(Date.now() / 1000);

// a new code with status: the admin key goes back to the seller once; only its hash is stored
export async function saleCreate(env, id, exp, creator) {
  const db = await salesDb(env); if (!db) return '';
  const adm = randHex(16);
  await db.prepare('INSERT OR REPLACE INTO sale_meta (id, adm, exp, created, creator) VALUES (?, ?, ?, ?, ?)').bind(id, await sha256hex(adm), exp || 0, now(), creator || '').run();
  return adm;
}

// a buyer's report: { d: device hash, used: bytes so far, on: connected now }
export async function saleBeat(env, id, d, used, on) {
  const db = await salesDb(env); if (!db) return 503;
  const m = await db.prepare('SELECT exp, creator FROM sale_meta WHERE id = ?').bind(id).first();
  if (!m) return 404;
  const t = now();
  if (m.exp && m.exp + 86400 < t) return 410;                 // a day of grace for clocks and late reports
  if (m.creator && m.creator === d) return 204;               // the seller testing their own code
  used = Math.max(0, Math.min(1e14, Math.floor(+used || 0)));
  const row = await db.prepare('SELECT used FROM sale_dev WHERE id = ? AND dev = ?').bind(id, d).first();
  if (!row) {
    const c = await db.prepare('SELECT COUNT(*) AS n FROM sale_dev WHERE id = ?').bind(id).first();
    if (c && c.n >= SALE_DEV_MAX) return 429;
    await db.prepare('INSERT OR IGNORE INTO sale_dev (id, dev, first, last, used, live) VALUES (?, ?, ?, ?, ?, ?)').bind(id, d, t, t, used, on ? 1 : 0).run();
  } else {
    // the byte count only grows (a reinstall restarts the buyer's counter: the highest value is kept)
    await db.prepare('UPDATE sale_dev SET last = ?, used = MAX(used, ?), live = ? WHERE id = ? AND dev = ?').bind(t, used, on ? 1 : 0, id, d).run();
  }
  if (Math.random() < 0.01) {
    const old = t - KEEP_SEC;
    await db.prepare('DELETE FROM sale_dev WHERE id IN (SELECT id FROM sale_meta WHERE exp > 0 AND exp < ?)').bind(old).run();
    await db.prepare('DELETE FROM sale_meta WHERE exp > 0 AND exp < ?').bind(old).run();
  }
  return 204;
}

// what the seller sees: one entry per device (a short, anonymous tag instead of the hash)
export async function saleStats(env, id, key) {
  const db = await salesDb(env); if (!db) return { status: 503 };
  const m = await db.prepare('SELECT adm, exp, created FROM sale_meta WHERE id = ?').bind(id).first();
  if (!m) return { status: 404 };
  if (!key || (await sha256hex(key)) !== m.adm) return { status: 403 };
  const { results } = await db.prepare('SELECT dev, first, last, used, live FROM sale_dev WHERE id = ? ORDER BY first LIMIT ?').bind(id, SALE_DEV_MAX).all();
  const t = now();
  return { status: 200, body: { now: t, exp: m.exp || 0, created: m.created || 0,
    devices: (results || []).map(r => ({ d: String(r.dev).slice(0, 4), first: r.first, last: r.last, used: r.used, live: !!r.live && t - r.last < LIVE_SEC })) } };
}
