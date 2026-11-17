// GET /c/K7M2QX/stats?k=<admin key> — a sales link's buyers, for the seller who made it (see lib/sales.js)
import { saleStats } from '../../../lib/sales.js';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
export const onRequestOptions = () => new Response(null, { headers: CORS });
export async function onRequestGet({ params, request, env }) {
  const id = String(params.id || '').toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  const k = String(new URL(request.url).searchParams.get('k') || '');
  if (!/^[0-9a-f]{32}$/.test(k)) return new Response('key needed', { status: 403, headers: CORS });
  const r = await saleStats(env, id, k);
  if (r.status !== 200) return new Response(null, { status: r.status, headers: CORS });
  return Response.json(r.body, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
