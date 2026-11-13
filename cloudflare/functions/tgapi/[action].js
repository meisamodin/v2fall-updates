// Mini app API (dl.v2fall.com/app): POST /tgapi/send {initData} (the APK into the chat)
// · POST /tgapi/support {initData, msg}. Calls that act for a user carry Telegram's signed initData, checked here.

const J = (o, s = 200) => Response.json(o, { status: s });
const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
async function userOf(initData, token) {
  const p = new URLSearchParams(String(initData || '')); const h = p.get('hash'); if (!h) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => k + '=' + v).join('\n');
  const sk = await hmac('WebAppData', token);
  if (hex(await hmac(sk, dcs)) !== h) return null;
  if (Date.now() / 1000 - (+p.get('auth_date') || 0) > 86400) return null;
  try { return JSON.parse(p.get('user') || 'null'); } catch (e) { return null; }
}
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try { return await r.json(); } catch (e) { return {}; }
}
// in-memory limits (no storage writes): good enough against a burst from one user
const RL = new Map();
async function limited(kv, key, n, ttl) { const now = Date.now(), e = RL.get(key) || { t: now, n: 0 }; if (now - e.t > ttl * 1000) { e.t = now; e.n = 0; } e.n++; RL.set(key, e); return e.n > n; }

export async function onRequestPost({ request, env, params }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'x', kv = env.CODES;
  let j = {}; try { j = JSON.parse((await request.text()).slice(0, 8000)); } catch (e) { return J({ error: 'bad' }, 400); }
  if (!env.TELEGRAM_BOT_TOKEN) return J({ error: 'off' }, 503);
  const user = await userOf(j.initData, env.TELEGRAM_BOT_TOKEN);
  if (!user || !user.id) return J({ error: 'auth' }, 403);
  if (params.action === 'send') {
    if (await limited(kv, 'rl:ts:' + user.id, 10, 3600)) return J({ error: 'too many' }, 429);
    const kind = /^(apk|arm64|armv7|a6|win|macarm|macintel|deb|tar)$/.test(j.kind || '') ? j.kind : 'apk';
    const f = await kv.get('tg:f:' + kind) || (kind === 'apk' ? await kv.get('tg:apk') : null); if (!f) return J({ error: 'none' }, 404);
    const a = JSON.parse(f); const r = await tg(env, 'copyMessage', { chat_id: user.id, from_chat_id: a.chat, message_id: a.id });
    return J({ ok: !!r.ok });
  }
  if (params.action === 'support') {
    if (await limited(kv, 'rl:tq:' + user.id, 5, 3600)) return J({ error: 'too many' }, 429);
    const msg = String(j.msg || '').trim().slice(0, 2000); if (!msg || !env.TELEGRAM_ADMIN_ID) return J({ error: 'bad' }, 400);
    const who = [user.first_name, user.username ? '@' + user.username : '', '#' + user.id].filter(Boolean).join(' ');
    const r = await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_ADMIN_ID, text: `📨 از مینی‌اپ — ${who}\n\n${msg}\n\n(برای جواب، روی همین پیام ریپلای بزنید) #u${user.id}` });
    return J({ ok: !!r.ok });
  }
  return J({ error: 'unknown' }, 404);
}
