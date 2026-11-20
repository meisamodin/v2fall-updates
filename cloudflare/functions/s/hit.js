// POST /s/hit?k=active&p=android&ch=stable&v=18.9.5 — the app says "in use today" once a day (no ID)
// POST /s/hit?k=err&p=windows&e=timeout&pr=vless — opt-in: a failed connection's kind of error and protocol (no ID)
import { bump } from '../../lib/stats.js';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
export const onRequestOptions = () => new Response(null, { headers: CORS });
export async function onRequestPost(ctx) {
  const u = new URL(ctx.request.url), k = u.searchParams.get('k');
  if (k === 'active') ctx.waitUntil(bump(ctx.env, ctx.request, 'active', u.searchParams.get('p'), u.searchParams.get('ch'), u.searchParams.get('v')));
  // opt-in connection error report: kind of error (column "channel") and protocol type (column "version"), nothing else
  if (k === 'err') ctx.waitUntil(bump(ctx.env, ctx.request, 'err', u.searchParams.get('p'), u.searchParams.get('e'), u.searchParams.get('pr')));
  return new Response('ok', { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
