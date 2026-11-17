// Sales links with buyer status, end to end on the real functions: KV in a Map, D1 in node:sqlite.
// node cloudflare/test/sales-test.mjs   (exits 1 on the first failed check)
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const load = f => import(pathToFileURL(path.join(dir, '../functions', f)).href);
const create = await load('c/index.js'), open = await load('c/[id].js'), hb = await load('c/[id]/hb.js'), stats = await load('c/[id]/stats.js');
const sql = new DatabaseSync(':memory:');
const stmt = (q, args = []) => ({
  bind: (...a) => stmt(q, a),
  first: async () => /^\s*select/i.test(q) ? (sql.prepare(q).get(...args) ?? null) : (sql.prepare(q).run(...args), null),
  all: async () => ({ results: sql.prepare(q).all(...args) }),
  run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; },
});
const kv = new Map();
const env = {
  STATS: { prepare: q => stmt(q) },
  CODES: { get: async k => kv.has(k) ? kv.get(k).v : null, getWithMetadata: async k => kv.has(k) ? { value: kv.get(k).v, metadata: kv.get(k).m } : { value: null, metadata: null }, put: async (k, v, o) => { kv.set(k, { v, m: (o || {}).metadata }); } },
};
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const seller = 'a'.repeat(24), buyer1 = 'b1'.repeat(12), buyer2 = 'c2'.repeat(12);
const post = (u, body) => new Request('https://dl.v2fall.com' + u, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

// a code with buyer status, made by the seller
let r = await create.onRequestPost({ request: post('/c?ttl=30&st=1&c=' + seller, 'QUJDRA'), env });
const j = await r.json(); ok(/^[2-9A-HJ-NP-Z]{6}$/.test(j.id) && /^[0-9a-f]{32}$/.test(j.adm), 'creation gives a code and an admin key');
const id = j.id, adm = j.adm;
// a code without status gives no key, and the status calls do not know it
r = await create.onRequestPost({ request: post('/c?ttl=30', 'QUJDRA'), env }); const plain = await r.json();
ok(!plain.adm, 'a code without status has no admin key');
r = await hb.onRequestPost({ params: { id: plain.id }, request: post('/c/x/hb', JSON.stringify({ d: buyer1, used: 5, on: 1 })), env }); ok(r.status === 404, 'reports for a code without status are refused (404)');
// opening the code alone records nothing (the buyer has not agreed yet)
await open.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '?d=' + buyer1), env });
let s = await (await stats.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '/stats?k=' + adm), env })).json();
ok(s.devices.length === 0, 'opening the code is not reported by itself');
// reports
const beat = (d, used, on) => hb.onRequestPost({ params: { id }, request: post('/c/' + id + '/hb', JSON.stringify({ d, used, on })), env });
ok((await beat(buyer1, 0, 1)).status === 204, 'buyer 1 activates');
ok((await beat(buyer1, 1.5e9, 1)).status === 204, 'buyer 1 reports 1.5 GB');
ok((await beat(buyer1, 2e8, 0)).status === 204, 'buyer 1 reports a lower count (reinstall) and disconnects');
ok((await beat(buyer2, 3e8, 1)).status === 204, 'buyer 2 activates');
ok((await beat(seller, 9e9, 1)).status === 204, 'the seller testing their own code is accepted but not counted');
// the seller's view
r = await stats.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '/stats?k=' + adm), env });
s = await r.json();
ok(r.status === 200 && s.devices.length === 2, 'the seller sees 2 devices (not their own test)');
const b1 = s.devices.find(x => x.d === buyer1.slice(0, 4)), b2 = s.devices.find(x => x.d === buyer2.slice(0, 4));
ok(b1 && b1.used === 1.5e9 && b1.live === false, 'buyer 1: 1.5 GB kept (count only grows), offline');
ok(b2 && b2.used === 3e8 && b2.live === true, 'buyer 2: 300 MB, online');
ok(!JSON.stringify(s).includes(buyer1), 'the full device hash is not shown to the seller');
// keys and bad input
ok((await stats.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '/stats?k=' + 'f'.repeat(32)), env })).status === 403, 'a wrong admin key is refused (403)');
ok((await stats.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '/stats'), env })).status === 403, 'no key is refused (403)');
ok((await hb.onRequestPost({ params: { id }, request: post('/c/x/hb', '{"d":"zz"}'), env })).status === 400, 'a malformed report is refused (400)');
ok((await hb.onRequestPost({ params: { id: 'nope' }, request: post('/c/x/hb', '{}'), env })).status === 400, 'a bad code is refused (400)');
// device cap
for (let i = 0; i < 40; i++) await beat(i.toString(16).padStart(2, '0').repeat(12), 1, 1);
s = await (await stats.onRequestGet({ params: { id }, request: new Request('https://x/c/' + id + '/stats?k=' + adm), env })).json();
ok(s.devices.length === 30, 'at most 30 devices are kept per code');
// an expired code stops taking reports
sql.prepare('UPDATE sale_meta SET exp = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 3 * 86400, id);
ok((await beat(buyer1, 2e9, 1)).status === 410, 'reports after the code ran out are refused (410)');
console.log(fails ? fails + ' check(s) failed' : 'all checks passed'); process.exit(fails ? 1 : 0);
