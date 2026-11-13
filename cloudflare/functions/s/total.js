// GET /s/total — public: all downloads counted on the own servers (the website adds GitHub's numbers)
import { ensure } from '../../lib/stats.js';
const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' };
export async function onRequestGet({ env }) {
  if (!env.STATS) return new Response(JSON.stringify({ downloads: null }), { headers: H });
  try { await ensure(env.STATS); const r = await env.STATS.prepare("SELECT COALESCE(SUM(n),0) AS n FROM counts WHERE kind='dl'").first(); return new Response(JSON.stringify({ downloads: r.n }), { headers: H }); }
  catch (e) { return new Response(JSON.stringify({ downloads: null }), { headers: H }); }
}
