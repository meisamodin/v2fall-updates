// Runs the real relay broker (functions/rb/[action].js) locally for CI: D1 is emulated with node:sqlite.
// node cloudflare/test/rb-local.mjs [port]
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { onRequest } = await import(pathToFileURL(path.join(dir, '../functions/rb/[action].js')).href);
const sql = new DatabaseSync(':memory:');
const stmt = (q, args = []) => ({
  bind: (...a) => stmt(q, a),
  first: async () => { const s = sql.prepare(q); return /^\s*(select|update|insert|delete)[\s\S]*returning|^\s*select/i.test(q) ? (s.get(...args) ?? null) : (s.run(...args), null); },
  all: async () => ({ results: sql.prepare(q).all(...args) }),
  run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; },
});
const env = { STATS: { prepare: q => stmt(q) }, RB_RATE: process.env.RB_RATE || '' };
const port = +process.argv[2] || 8788;
http.createServer(async (req, res) => {
  const m = /^\/rb\/([a-z]+)/.exec(req.url || '');
  if (!m) { res.writeHead(404); return res.end(); }
  const body = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
  const request = new Request('http://local' + req.url, { method: req.method, headers: { 'CF-Connecting-IP': '127.0.0.1' }, body: req.method === 'POST' ? body : undefined });
  const r = await onRequest({ request, env, params: { action: m[1] } });
  res.writeHead(r.status, { 'Content-Type': 'application/json' });
  res.end(await r.text());
}).listen(port, '127.0.0.1', () => console.log('rb-local on', port));
