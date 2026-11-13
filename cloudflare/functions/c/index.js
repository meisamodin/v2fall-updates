// POST /c — store a short code. The app encrypts the config on the phone first, so only
// ciphertext (base64url) ever reaches this server. A code lives for 30 days.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I: easy to type from an SMS
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestPost({ request, env }) {
  const body = (await request.text()).trim();
  if (!body || body.length > 12288 || !/^[A-Za-z0-9_-]+$/.test(body)) return new Response('bad body', { status: 400, headers: CORS });
  for (let i = 0; i < 5; i++) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => ALPHABET[x & 31]).join('');
    if (await env.CODES.get(id) === null) {
      await env.CODES.put(id, body, { expirationTtl: 30 * 24 * 3600 });
      return Response.json({ id }, { headers: CORS });
    }
  }
  return new Response('busy', { status: 503, headers: CORS });
}
