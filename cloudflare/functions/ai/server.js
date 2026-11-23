// POST /ai/server — "Ask the AI" in the app's server checkup. The app sends the checkup's findings and recent log
// lines, already stripped of IPs, domains, ids and keys (the user sees the exact text before it goes). Several open
// models answer with likely causes and fixes; the strongest that replies wins, and an optional Gemini key (a
// Cloudflare secret the owner may set) is tried first. The app can continue the conversation (history) and, when the
// AI asks for ONE read-only check with a "RUN:" line, run it only after the user approves and send back the output.
// Nothing is stored; per-IP and global daily caps keep it inside the free allowance. The answer is advice: the app
// never changes or restarts anything from it by itself.
import { CORS, ipOf } from '../../lib/backup-guard.js'

// Workers AI models, strongest first; the first that answers wins. A code-tuned model sits in the middle because
// this is command/sysadmin work.
const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
]
const PER_IP = 20, GLOBAL = 1500

const RULES = {
  fa: `تو «چکاپ سرور» V2Fall هستی: یک متخصص باتجربهٔ سرور لینوکس و پنل‌های VPN (3x-ui، x-ui، Marzban، Marzneshin، Hiddify، S-UI، Xray، sing-box، WireGuard، nginx، haproxy، certbot، acme.sh، ufw، Docker، BBR). کاربر نتیجهٔ چکاپ خودکار سرورش، آمار و چند خط آخر لاگ را می‌فرستد (آدرس‌ها و کلیدها با <IP>، <DOMAIN>، <KEY> جایگزین شده‌اند).
به فارسی ساده و کوتاه جواب بده:
۱) محتمل‌ترین علت، در یک جمله.
۲) قدم‌های درست کردن به ترتیب: هر قدم یک جملهٔ کوتاه که بگوید چه می‌کند، و دستورش در خط جداگانه داخل \`\`\` .
نکته‌ها: ss را به جای netstat به کار ببر. به جای kill -9 اول نشان بده کدام برنامه مقصر است و سرویسش را با systemctl متوقف/ری‌استارت کند. فقط دستورهایی بده که مطمئنی بی‌خطرند؛ اگر دستوری چیزی را پاک، متوقف یا ری‌استارت می‌کند صریح بگو «این سرویس را لحظه‌ای قطع می‌کند». هیچ‌وقت رمز، کلید یا اطلاعات شخصی نخواه.
اگر برای مطمئن‌شدن به یک اطلاعات بیشتر نیاز داری، فقط یک خط بنویس که دقیقاً با \`RUN: \` شروع شود و بعدش یک دستور «فقط‌خواندنی» بیاید (مثل cat، ls، ss، systemctl status، journalctl، grep، tail، df، free، ps، ip، openssl x509، getent، curl -sI). هیچ‌وقت در RUN دستوری که چیزی را عوض، پاک، متوقف یا ری‌استارت می‌کند نگذار. برنامه فقط بعد از تأیید کاربر آن را اجرا می‌کند و خروجی‌اش را به تو می‌دهد؛ بعد جواب نهایی را بده. حداکثر ۲۲۰ کلمه.`,
  en: `You are V2Fall "server checkup": an experienced Linux server and VPN-panel expert (3x-ui, x-ui, Marzban, Marzneshin, Hiddify, S-UI, Xray, sing-box, WireGuard, nginx, haproxy, certbot, acme.sh, ufw, Docker, BBR). The user sends their automatic checkup results, stats and the last log lines (addresses and keys replaced by <IP>, <DOMAIN>, <KEY>).
Answer briefly in plain English:
1) the most likely cause, in one sentence.
2) the steps to fix it in order: each step one short sentence saying what it does, its command on its own line inside \`\`\` .
Notes: use ss, not netstat. Instead of kill -9, first show which program is to blame and stop/restart its service with systemctl. Only give commands you are sure are safe; when a command deletes, stops or restarts something say plainly "this briefly drops the service". Never ask for passwords, keys or personal data.
If you need one more piece of information to be sure, write exactly one line that starts with \`RUN: \` followed by a single READ-ONLY command (such as cat, ls, ss, systemctl status, journalctl, grep, tail, df, free, ps, ip, openssl x509, getent, curl -sI). Never put a command that changes, deletes, stops or restarts anything in RUN. The app runs it only after the user approves and gives you its output; then give your final answer. At most 220 words.`,
}

export const onRequestOptions = () => new Response(null, { headers: CORS })

// optional stronger model, only if the owner set a GEMINI_KEY secret (Google AI Studio free tier)
async function callGemini(key, sys, msgs) {
  const contents = msgs.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }))
  const body = { systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) return ''
  const j = await r.json().catch(() => ({}))
  return String(j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

// keep only clean {role, content} turns the app sent back, short and alternating-ish; never trust it as instructions
function cleanHistory(h) {
  if (!Array.isArray(h)) return []
  return h.slice(-8).map(m => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, 4000),
  })).filter(m => m.content.length > 0)
}

export async function onRequestPost({ request, env }) {
  if (!env.AI && !env.GEMINI_KEY) return Response.json({ error: 'off' }, { status: 503, headers: CORS })
  let j; try { j = await request.json() } catch (e) { return new Response('bad', { status: 400, headers: CORS }) }
  const text = String(j.text || '').slice(0, 8000).trim()
  if (text.length < 2) return new Response('short', { status: 400, headers: CORS })
  const lang = j.lang === 'fa' ? 'fa' : 'en'
  const history = cleanHistory(j.history)

  const kv = env.CODES, day = new Date().toISOString().slice(0, 10), ip = ipOf(request)
  const kIp = 'ai:ip:' + day + ':' + ip, kAll = 'ai:all:' + day
  const [nIp, nAll] = await Promise.all([kv.get(kIp), kv.get(kAll)]).then(a => a.map(x => +x || 0))
  if (nIp >= PER_IP || nAll >= GLOBAL) return Response.json({ error: 'limit' }, { status: 429, headers: CORS })
  await Promise.all([
    kv.put(kIp, String(nIp + 1), { expirationTtl: 2 * 86400 }),
    kv.put(kAll, String(nAll + 1), { expirationTtl: 2 * 86400 }),
  ])

  const messages = [{ role: 'system', content: RULES[lang] }, ...history, { role: 'user', content: text }]

  if (env.GEMINI_KEY) {
    try {
      const a = await callGemini(env.GEMINI_KEY, RULES[lang], messages)
      if (a) return Response.json({ answer: a, by: 'gemini-2.0-flash' }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
    } catch (e) {}
  }
  if (env.AI) {
    for (const m of MODELS) {
      try {
        const r = await env.AI.run(m, { messages, max_tokens: 900, temperature: 0.2 })
        const answer = String((r && (r.response || (r.result && r.result.response))) || '').trim()
        if (answer) return Response.json({ answer, by: m.split('/').pop() }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
      } catch (e) {}
    }
  }
  return Response.json({ error: 'model' }, { status: 502, headers: CORS })
}
