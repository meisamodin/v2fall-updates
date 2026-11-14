// POST /c — store a short code. The app encrypts the config on the phone first, so only
// ciphertext (base64url) ever reaches this server. A code lives for 30 days, or ?ttl=<days> (1–30).
// ?one=1 (sales links, "one device only"): the first device that opens the code owns it (see [id].js).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I: easy to type from an SMS
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestPost({ request, env }) {
  const body = (await request.text()).trim();
  if (!body || body.length > 12288 || !/^[A-Za-z0-9_-]+$/.test(body)) return new Response('bad body', { status: 400, headers: CORS });
  const q = new URL(request.url).searchParams;
  const days = Math.min(30, Math.max(1, parseInt(q.get('ttl') || '30', 10) || 30));
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 3600;
  const metadata = q.get('one') === '1' ? { one: 1, exp } : { exp };
  for (let i = 0; i < 5; i++) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => ALPHABET[x & 31]).join('');
    if (await env.CODES.get(id) === null) {
      await env.CODES.put(id, body, { expiration: exp, metadata });
      return Response.json({ id }, { headers: CORS });
    }
  }
  return new Response('busy', { status: 503, headers: CORS });
}
