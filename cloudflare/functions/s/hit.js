// POST /s/hit?k=active&p=android&ch=stable&v=18.9.5 — the app says "in use today" once a day (no ID)
import { bump } from '../../lib/stats.js';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
export const onRequestOptions = () => new Response(null, { headers: CORS });
export async function onRequestPost(ctx) {
  const u = new URL(ctx.request.url), k = u.searchParams.get('k');
  if (k === 'active') ctx.waitUntil(bump(ctx.env, ctx.request, 'active', u.searchParams.get('p'), u.searchParams.get('ch'), u.searchParams.get('v')));
  return new Response('ok', { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
