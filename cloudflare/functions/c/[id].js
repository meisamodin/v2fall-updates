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
    if (!m.dev) await env.CODES.put(id, v, { expiration: m.exp, metadata: { ...m, dev: d } });
    else if (m.dev !== d) return new Response('used on another device', { status: 410, headers: CORS });
  }
  return new Response(v, { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
