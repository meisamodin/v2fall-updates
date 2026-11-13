// POST /r — "report a problem" from the app. The app removes server addresses, keys and IPs from the log
// before sending; this endpoint stores the report for 30 days and, when the Telegram bot is set up
// (TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_ID), forwards it to the admin chat. Rate limited per IP.
import { CORS, ipOf } from '../../lib/backup-guard.js'

const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

const RL = new Map(); // in memory: no storage write per request
export const onRequestOptions = () => new Response(null, { headers: CORS });

export async function onRequestPost({ request, env }) {
  const kv = env.CODES, ip = ipOf(request);
  const now = Date.now(), e = RL.get(ip) || { t: now, n: 0 }; if (now - e.t > 3600e3) { e.t = now; e.n = 0; } const n = ++e.n; RL.set(ip, e);
  // many people in Iran share one IP (mobile networks): generous per-IP limit, the size cap stops abuse
  if (n > 30) return new Response('too many', { status: 429, headers: CORS });
  const raw = await request.text();
  if (raw.length > 96 * 1024) return new Response('too big', { status: 413, headers: CORS });
  let j; try { j = JSON.parse(raw); } catch (e) { return new Response('bad body', { status: 400, headers: CORS }); }
  const rep = {
    t: Date.now(), cc: request.cf && request.cf.country || '', asn: request.cf && request.cf.asOrganization || '',
    ver: clip(j.ver, 20), plat: clip(j.plat, 120), state: clip(j.state, 40), proto: clip(j.proto, 40),
    msg: clip(j.msg, 2000), contact: clip(j.contact, 80), log: clip(j.log, 60000),
  };
  let id = ''; const r = crypto.getRandomValues(new Uint8Array(6)); for (const b of r) id += ABC[b % ABC.length];
  await kv.put('r:' + id, JSON.stringify(rep), { expirationTtl: 30 * 86400 });
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_ID) {
    const head = `🐞 R-${id}\nV2Fall ${rep.ver} · ${rep.plat}\n${rep.state} · ${rep.proto} · ${rep.cc} ${rep.asn}` + (rep.contact ? `\n👤 ${rep.contact}` : '') + (rep.msg ? `\n\n${rep.msg}` : '');
    const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
    try {
      await fetch(api + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_ADMIN_ID, text: head.slice(0, 4000) }) });
      if (rep.log) {
        const fd = new FormData(); fd.append('chat_id', env.TELEGRAM_ADMIN_ID);
        fd.append('document', new Blob([rep.log], { type: 'text/plain' }), `R-${id}.txt`);
        await fetch(api + '/sendDocument', { method: 'POST', body: fd });
      }
    } catch (e) {}
  }
  return Response.json({ ok: true, id: 'R-' + id }, { headers: CORS });
}
