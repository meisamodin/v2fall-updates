// GET /donate?n=100 — the app's "Support V2Fall" button. A Telegram deep link (t.me/bot?start=donate) does not
// reach the bot when the chat already exists, so this asks Telegram for a Stars invoice link and sends the
// visitor straight to it: the payment sheet opens in Telegram, whatever the chat history.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const n = Math.min(Math.max(parseInt(u.searchParams.get('n') || '100', 10) || 100, 1), 10000);
  const en = u.searchParams.get('lang') === 'en';
  const fallback = 'https://t.me/v2fallbot?start=donate';
  if (!env.TELEGRAM_BOT_TOKEN) return Response.redirect(fallback, 302);
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: en ? 'Support V2Fall' : 'حمایت از V2Fall', description: en ? 'Thank you for helping keep V2Fall free.' : 'ممنون که کمک می‌کنی V2Fall رایگان بماند.',
        payload: 'donate-' + n, currency: 'XTR', prices: [{ label: en ? 'Support' : 'حمایت', amount: n }] }),
    });
    const j = await r.json();
    if (j && j.ok && /^https:\/\/t\.me\//.test(j.result || '')) return Response.redirect(j.result, 302);
  } catch (e) {}
  return Response.redirect(fallback, 302);
}
