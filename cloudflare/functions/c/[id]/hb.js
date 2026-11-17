// POST /c/K7M2QX/hb  {"d":"<device hash>","used":<bytes>,"on":1} — a buyer's status report for a sales link
// with buyer status on (see lib/sales.js). The app sends it only after the buyer agreed, at most every few minutes.
import { saleBeat } from '../../../lib/sales.js';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
export const onRequestOptions = () => new Response(null, { headers: CORS });
export async function onRequestPost({ params, request, env }) {
  const id = String(params.id || '').toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(id)) return new Response('bad code', { status: 400, headers: CORS });
  let j = null; try { const t = await request.text(); if (t.length < 400) j = JSON.parse(t); } catch (e) {}
  if (!j || !/^[0-9a-f]{16,64}$/.test(String(j.d || ''))) return new Response('bad body', { status: 400, headers: CORS });
  const st = await saleBeat(env, id, String(j.d), j.used, !!j.on);
  return new Response(null, { status: st, headers: CORS });
}
