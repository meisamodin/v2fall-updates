// POST /ai/server — "Ask the AI" in the app's server checkup. The app sends the checkup's findings and recent log lines,
// already stripped of IPs, domains, ids and keys (the user sees the exact text before it goes). An open model on
// Cloudflare Workers AI answers with likely causes and fixes. Nothing is stored; per-IP and global daily caps keep it
// inside the free allowance. The answer is advice: the app never runs anything from it by itself.
import { CORS, ipOf } from '../../lib/backup-guard.js'

const MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct']
const PER_IP = 6, GLOBAL = 400

const SYSTEM = {
  fa: 'تو یک متخصص باتجربهٔ سرور لینوکس و پنل‌های VPN هستی (3x-ui، x-ui، Marzban، Hiddify، S-UI، Xray، sing-box، nginx، certbot، ufw). کاربر نتیجهٔ چکاپ خودکار سرورش و چند خط آخر لاگ را می‌فرستد (آدرس‌ها و کلیدها با <IP>، <DOMAIN>، <KEY> جایگزین شده‌اند). به فارسی ساده و کوتاه جواب بده: ۱) محتمل‌ترین علت، ۲) قدم‌های درست کردن به ترتیب: هر قدم یک جملهٔ کوتاه که بگوید چه می‌کند، و دستورش در خط بعد. ss را به جای netstat به کار ببر (netstat اغلب نصب نیست). به جای kill -9 اول بگو چطور ببیند کدام برنامه مقصر است و سرویسش را با systemctl متوقف کند. فقط دستورهایی بنویس که مطمئنی بی‌خطرند؛ اگر دستوری چیزی را پاک یا ری‌استارت می‌کند صریح بگو. هیچ‌وقت رمز، کلید یا اطلاعات شخصی نخواه. اگر مطمئن نیستی، بگو و یک بررسی بعدی پیشنهاد کن. حداکثر ۲۰۰ کلمه.',
  en: 'You are an experienced Linux server and VPN panel expert (3x-ui, x-ui, Marzban, Hiddify, S-UI, Xray, sing-box, nginx, certbot, ufw). The user sends their server checkup results and the last log lines (addresses and keys replaced by <IP>, <DOMAIN>, <KEY>). Answer briefly in plain English: 1) the most likely cause, 2) the steps to fix it in order: each step one short sentence saying what it does, its command on the next line. Use ss instead of netstat (often missing). Instead of kill -9, first show how to see which program is to blame and stop its service with systemctl. Only give commands you are sure are safe; say clearly when a command deletes or restarts something. Never ask for passwords, keys or personal data. If unsure, say so and suggest a next check. At most 200 words.',
}

export const onRequestOptions = () => new Response(null, { headers: CORS })

export async function onRequestPost({ request, env }) {
  if (!env.AI) return Response.json({ error: 'off' }, { status: 503, headers: CORS })
  let j; try { j = await request.json() } catch (e) { return new Response('bad', { status: 400, headers: CORS }) }
  const text = String(j.text || '').slice(0, 6000).trim()
  if (text.length < 20) return new Response('short', { status: 400, headers: CORS })
  const lang = j.lang === 'fa' ? 'fa' : 'en'
  const kv = env.CODES, day = new Date().toISOString().slice(0, 10), ip = ipOf(request)
  const kIp = 'ai:ip:' + day + ':' + ip, kAll = 'ai:all:' + day
  const [nIp, nAll] = await Promise.all([kv.get(kIp), kv.get(kAll)]).then(a => a.map(x => +x || 0))
  if (nIp >= PER_IP || nAll >= GLOBAL) return Response.json({ error: 'limit' }, { status: 429, headers: CORS })
  await Promise.all([kv.put(kIp, String(nIp + 1), { expirationTtl: 2 * 86400 }), kv.put(kAll, String(nAll + 1), { expirationTtl: 2 * 86400 })])
  const messages = [{ role: 'system', content: SYSTEM[lang] }, { role: 'user', content: text }]
  for (const m of MODELS) {
    try {
      const r = await env.AI.run(m, { messages, max_tokens: 700, temperature: 0.2 })
      const answer = String(r && (r.response || r.result && r.result.response) || '').trim()
      if (answer) return Response.json({ answer }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
    } catch (e) {}
  }
  return Response.json({ error: 'model' }, { status: 502, headers: CORS })
}
