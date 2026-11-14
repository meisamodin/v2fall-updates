// GET /c/K7M2QX?d=<device hash> — the stored ciphertext for a short code.
// A "one device" code is bound to the first device hash that opens it; any other device gets 410.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestGet({ params, request, env }) {
  const id = String(params.id || '').toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  const { value: v, metadata: m } = await env.CODES.getWithMetadata(id);
  if (v === null) return new Response('not found', { status: 404, headers: CORS });
  if (m && m.one) {
    const d = String(new URL(request.url).searchParams.get('d') || '');
    if (!/^[0-9a-f]{16,64}$/.test(d)) return new Response('device needed', { status: 410, headers: CORS });
    if (m.creator && d === m.creator) { /* the seller testing their own code: not bound */ }
    else if (env.STATS) {
      // the binding lives in D1: one row per code, the first insert wins. KV is eventually consistent (a read can
      // be up to a minute old), so two phones opening the code within that minute were both let in.
      const db = env.STATS;
      await db.prepare('CREATE TABLE IF NOT EXISTS code_dev (id TEXT PRIMARY KEY, dev TEXT NOT NULL, exp INTEGER)').run();
      await db.prepare('INSERT OR IGNORE INTO code_dev (id, dev, exp) VALUES (?, ?, ?)').bind(id, m.dev || d, m.exp || 0).run();
      const row = await db.prepare('SELECT dev FROM code_dev WHERE id = ?').bind(id).first();
      if (!row || row.dev !== d) return new Response('used on another device', { status: 410, headers: CORS });
      if (Math.random() < 0.02) await db.prepare('DELETE FROM code_dev WHERE exp > 0 AND exp < ?').bind(Math.floor(Date.now() / 1000)).run();
    }
    else if (!m.dev) await env.CODES.put(id, v, { expiration: m.exp, metadata: { ...m, dev: d } });
    else if (m.dev !== d) return new Response('used on another device', { status: 410, headers: CORS });
  }
  return new Response(v, { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
