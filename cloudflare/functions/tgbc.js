// Broadcast worker: sends the admin's message to 25 bot users per call, then calls itself for the next 25
// (keeps under the per-request limits and Telegram's 30 messages a second). Only the bot itself can call it.
const enc = new TextEncoder();
async function secretOf(token) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('v2fall-tg:' + token)));
  return Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try { return await r.json(); } catch (e) { return {}; }
}
export async function onRequestPost(ctx) {
  const { request, env } = ctx, kv = env.CODES;
  if (!env.TELEGRAM_BOT_TOKEN || request.headers.get('X-Bc') !== await secretOf(env.TELEGRAM_BOT_TOKEN)) return new Response('no', { status: 403 });
  const job = JSON.parse(await kv.get('tg:bc') || 'null'); if (!job || job.done) return new Response('none');
  const l = await kv.list({ prefix: 'tgu:', cursor: job.cursor || undefined, limit: 25 });
  for (const k of l.keys) {
    const id = +k.name.slice(4); if (!id || String(id) === String(job.from)) continue;
    const r = await tg(env, 'copyMessage', { chat_id: id, from_chat_id: job.from, message_id: job.msg });
    if (r.ok) job.sent++; else { job.failed++; if (r.error_code === 403) await kv.delete(k.name); } // blocked the bot → forget
  }
  job.cursor = l.list_complete ? '' : l.cursor; job.done = l.list_complete; job.t = Date.now();
  await kv.put('tg:bc', JSON.stringify(job));
  if (job.done) await tg(env, 'sendMessage', { chat_id: job.from, text: `📣 ارسال همگانی تمام شد: ${job.sent} نفر رسید، ${job.failed} نفر نرسید (ربات را بسته‌اند).` });
  else ctx.waitUntil(new Promise(res => setTimeout(res, 1100)).then(() => fetch(request.url, { method: 'POST', headers: { 'X-Bc': request.headers.get('X-Bc') } })));
  return new Response('ok');
}
