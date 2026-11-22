// GET /reviews → { items: [{ text, l, t }] } approved user reviews (newest first) for the site and the mini app.
import { rvList } from '../lib/reviews.js';
export async function onRequestGet({ env }) {
  let items = [];
  try { items = (await rvList(env.CODES)).map(r => ({ text: r.text, l: r.l, t: r.t })); } catch (e) {}
  return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } });
}
