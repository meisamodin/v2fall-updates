// Anonymous app error reports, only from users who turned on «گزارش ناشناس خطاهای برنامه» (off by default).
//   POST /crash  body (text/plain JSON): {v: "18.9.117", p: "android|windows|macos|linux", k: "js|native", m: "message", s: "stack"}
// The app already strips addresses, IPs, links and long tokens before sending; this end does it again. Nothing about
// the sender is kept: no IP, no id. Same errors are counted together (sha-256 of kind + message + first frames).
// They are read on the admin stats page (/stats). Rows not seen for 60 days are deleted.

const J = (o, s = 200) => Response.json(o, { status: s, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
const RL = new Map();
function limited(key) {
  const now = Date.now(), e = RL.get(key) || { t: now, n: 0 };
  if (now - e.t > 3600e3) { e.t = now; e.n = 0; }
  e.n++; RL.set(key, e);
  if (RL.size > 20000) for (const [k, v] of RL) if (now - v.t > 3600e3) RL.delete(k);
  return e.n > 30;
}
import { scrub, crashInit } from '../lib/crash.js';
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.STATS; if (!db) return J({ error: 'off' }, 503);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (limited(ip)) return J({ error: 'too many' }, 429);
  let j; try { j = JSON.parse((await request.text()).slice(0, 6000)); } catch (e) { return J({ error: 'bad' }, 400); }
  const v = String(j.v || '').replace(/[^0-9.]/g, '').slice(0, 16), p = ['android', 'windows', 'macos', 'linux', 'web'].includes(j.p) ? j.p : 'other';
  const k = j.k === 'native' ? 'native' : 'js', m = scrub(j.m, 300), s = scrub(j.s, 2000);
  if (!m) return J({ error: 'empty' }, 400);
  const top = s.split('\n').slice(0, 4).join('\n').replace(/:\d+(:\d+)?/g, ''); // same error in another build counts together
  const h = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k + '|' + m.replace(/\d+/g, '#') + '|' + top))).slice(0, 24);
  const now = Date.now();
  await crashInit(db);
  await db.prepare('INSERT INTO crash (h, v, p, k, m, s, n, first, last) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7) ON CONFLICT(h) DO UPDATE SET n = n + 1, last = ?7, v = ?2, p = ?3, s = ?6').bind(h, v, p, k, m, s, now).run();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM crash WHERE last < ?').bind(now - 60 * 864e5).run();
  return J({ ok: true });
}

