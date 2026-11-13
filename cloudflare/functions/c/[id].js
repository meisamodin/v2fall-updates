// GET /c/K7M2QX — the stored ciphertext for a short code
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestGet({ params, env }) {
  const id = String(params.id || '').toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  const v = await env.CODES.get(id);
  return v === null ? new Response('not found', { status: 404, headers: CORS })
    : new Response(v, { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
