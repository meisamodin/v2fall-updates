// POST /b — store a backup for a 6-letter backup code. The app derives an id and a key from the code
// (PBKDF2, 300k rounds) and encrypts on the device, so this server only gets { id, d: ciphertext, del }.
// A backup lives for 24 hours and opens at most 3 times.
import { CORS, ipOf, canStore } from '../../lib/backup-guard.js'

export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestPost({ request, env }) {
  if (!(await canStore(env.CODES, ipOf(request)))) return new Response('too many', { status: 429, headers: CORS });
  let j;
  try { j = JSON.parse(await request.text()); } catch (e) { return new Response('bad body', { status: 400, headers: CORS }); }
  const id = String(j && j.id || ''), d = String(j && j.d || ''), del = String(j && j.del || '');
  if (!/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-f]{64}$/.test(del) || !d || d.length > 4 * 1048576 || !/^[A-Za-z0-9_-]+$/.test(d))
    return new Response('bad body', { status: 400, headers: CORS });
  const key = 'b:' + id;
  if (await env.CODES.get(key) !== null) return new Response('exists', { status: 409, headers: CORS });
  await env.CODES.put(key, JSON.stringify({ d, del, reads: 0, exp: Date.now() + 24 * 3600e3 }), { expirationTtl: 24 * 3600 });
  return Response.json({ ok: true, ttl: 24 * 3600 }, { headers: CORS });
}
