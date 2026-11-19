// GET /donate?n=100 — the app's "Support V2Fall" button. A Telegram deep link (t.me/bot?start=donate) does not
// reach the bot when the chat already exists, so this asks Telegram for a Stars invoice link and sends the
// visitor straight to it: the payment sheet opens in Telegram, whatever the chat history.
//
// Abuse: the money always goes to the bot's own Stars balance (nothing here can point it elsewhere), the amount is
// clamped to 1–10,000 and the only redirects are to t.me. An invoice link can be paid by anyone any number of times,
// so one link per amount and language is kept in the edge cache for a day: a flood of requests does not reach
// Telegram (no bot rate limit hit) and costs only cache reads. Plus a per-address limit in memory (no storage).
const RL = new Map();
function limited(key, n, sec) {
  const now = Date.now(), e = RL.get(key) || { t: now, n: 0 };
  if (now - e.t > sec * 1000) { e.t = now; e.n = 0; }
  e.n++; RL.set(key, e);
  if (RL.size > 20000) for (const [k, v] of RL) if (now - v.t > 600000) RL.delete(k);
  return e.n > n;
}
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const n = Math.min(Math.max(parseInt(u.searchParams.get('n') || '100', 10) || 100, 1), 10000);
  const en = u.searchParams.get('lang') === 'en';
  const fallback = 'https://t.me/v2fallbot?start=donate';
  if (!env.TELEGRAM_BOT_TOKEN) return Response.redirect(fallback, 302);
  const key = new Request(u.origin + '/donate-link/' + n + (en ? '/en' : '/fa'));
  try { const hit = await caches.default.match(key); if (hit) { const l = await hit.text(); if (/^https:\/\/t\.me\//.test(l)) return Response.redirect(l, 302); } } catch (e) {}
  if (limited(request.headers.get('CF-Connecting-IP') || 'x', 20, 60)) return Response.redirect(fallback, 302);
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: en ? 'Support V2Fall' : 'حمایت از V2Fall', description: en ? 'Thank you for helping keep V2Fall free.' : 'ممنون که کمک می‌کنی V2Fall رایگان بماند.',
        payload: 'donate-' + n, currency: 'XTR', prices: [{ label: en ? 'Support' : 'حمایت', amount: n }] }),
    });
    const j = await r.json();
    if (j && j.ok && /^https:\/\/t\.me\//.test(j.result || '')) {
      try { await caches.default.put(key, new Response(j.result, { headers: { 'Cache-Control': 'public, max-age=86400' } })); } catch (e) {}
      return Response.redirect(j.result, 302);
    }
  } catch (e) {}
  return Response.redirect(fallback, 302);
}
