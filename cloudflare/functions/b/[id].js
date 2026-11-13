// GET /b/<id> — the encrypted backup (at most 3 times, then it is deleted);
// DELETE /b/<id> with X-Del — remove it early. Wrong guesses are limited, see lib/backup-guard.js.
import { CORS, ipOf, blocked, miss } from '../../lib/backup-guard.js'

export const onRequestOptions = () => new Response(null, { headers: CORS });
const MAX_READS = 3;

export async function onRequestGet({ params, request, env }) {
  const id = String(params.id || '').toLowerCase(), ip = ipOf(request), kv = env.CODES;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  if (await blocked(kv, ip)) return new Response('too many tries', { status: 429, headers: CORS });
  const v = await kv.get('b:' + id);
  if (v === null) { await miss(kv, ip); return new Response('not found', { status: 404, headers: CORS }); }
  let o = {};
  try { o = JSON.parse(v); } catch (e) {}
  const reads = (+o.reads || 0) + 1;
  if (reads >= MAX_READS) await kv.delete('b:' + id);
  else {
    const left = Math.max(60, Math.floor(((+o.exp || 0) - Date.now()) / 1000));
    await kv.put('b:' + id, JSON.stringify({ ...o, reads }), { expirationTtl: left });
  }
  return new Response(o.d || '', { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Reads-Left': String(Math.max(0, MAX_READS - reads)) } });
}

export async function onRequestDelete({ params, request, env }) {
  const id = String(params.id || '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  const v = await env.CODES.get('b:' + id);
  if (v === null) return new Response('gone', { headers: CORS });
  let del = '';
  try { del = JSON.parse(v).del || ''; } catch (e) {}
  if (!del || request.headers.get('X-Del') !== del) return new Response('forbidden', { status: 403, headers: CORS });
  await env.CODES.delete('b:' + id);
  return new Response('deleted', { headers: CORS });
}
