// Filter Radar for the bot and the channel: one summary of the last 24 h per operator (from the D1 table that
// functions/radar.js fills), the /radar answer of @v2fallbot, and the automatic channel post when one operator
// suddenly gets much worse (and a second post when it is back). Nothing here is per user: only the counters.

export const ISP = { 197207: ['همراه اول', 'MCI'], 44244: ['ایرانسل', 'Irancell'], 58224: ['مخابرات', 'TCI'], 57218: ['رایتل', 'RighTel'], 31549: ['شاتل', 'Shatel'], 43754: ['آسیاتک', 'Asiatech'], 16322: ['پارس‌آنلاین', 'Pars Online'], 50810: ['مبین‌نت', 'Mobinnet'], 56402: ['های‌وب', 'HiWEB'], 25184: ['افرانت', 'Afranet'], 12880: ['زیرساخت', 'DCI'], 49100: ['پیشگامان', 'Pishgaman'], 44208: ['فن‌آوا', 'Fanava'], 39501: ['سامانتل', 'Samantel'], 42337: ['رسپینا', 'Respina'], 24631: ['فناپ‌تلکام', 'Fanap Telecom'], 48159: ['زیرساخت (TIC)', 'TIC'], 432008: ['شاتل موبایل', 'Shatel Mobile'], 432002: ['آپتل', 'Aptel'], 432045: ['زی‌تل', 'Zi-Tel'], 432032: ['تالیا', 'Taliya'], 432001: ['کیش‌سل پارس', 'Kish Cell Pars'], 432006: ['آرین‌تل', 'Arian-Tel'], 432003: ['لوتوس', 'Lotus (Parsian Hamrah)'], 432007: ['هوشمند امین', 'Hooshmand Amin'], 432014: ['ارتباطات کیش', 'TKC Kish'], 432070: ['ارتباطات سیار اصفهان', 'MTCE Isfahan'] };
const ispName = (a, en) => (ISP[a] || [])[en ? 1 : 0] || 'AS' + a;
const P = { VLESS: 'VLESS', VMESS: 'VMess', TROJAN: 'Trojan', SS: 'Shadowsocks', HY2: 'Hysteria2', TUIC: 'TUIC', WG: 'WireGuard', AWG: 'AmneziaWG', WARP: 'WARP', SSH: 'SSH', ANYTLS: 'AnyTLS', MIERU: 'Mieru', DNSTT: 'DNSTT', MDV: 'MasterDNS', TOR: 'Tor', PSI: 'Psiphon', RELAY: 'Ashflake', NAIVE: 'NaiveProxy' };
const TR = { tcp: 'TCP', ws: 'WS', grpc: 'gRPC', xhttp: 'XHTTP', splithttp: 'XHTTP', httpupgrade: 'HTTPUpgrade', h2: 'H2', http: 'HTTP', kcp: 'mKCP', quic: 'QUIC' };
export function label(k) {
  const [p, t, s, f] = String(k).split('|');
  return [P[p] || p, { reality: 'Reality', tls: 'TLS' }[s] || '', TR[t] || (t ? t.toUpperCase() : '')].filter(Boolean).join(' · ') + (f === '1' ? ' + Fragment' : '');
}
const FA = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const pct = (ok, n) => n ? Math.round(ok * 100 / n) : 0;

// every operator with enough reports: 24 h totals, the last 2 h against the 22 before them, best kinds
let MEMO = null;
export async function summary(db) {
  if (MEMO && Date.now() - MEMO.t < 300000) return MEMO.v;
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT a, k, SUM(n) AS n, SUM(ok) AS ok, SUM(CASE WHEN h > ? THEN n ELSE 0 END) AS rn, SUM(CASE WHEN h > ? THEN ok ELSE 0 END) AS rok FROM radar WHERE h > ? GROUP BY a, k').bind(now - 2, now - 2, now - 24).all();
  const ops = new Map();
  for (const x of r.results || []) {
    const o = ops.get(x.a) || { a: x.a, n: 0, ok: 0, rn: 0, rok: 0, k: [] };
    o.n += x.n; o.ok += x.ok; o.rn += x.rn; o.rok += x.rok;
    o.k.push({ k: x.k, n: x.n, ok: x.ok, rn: x.rn, rok: x.rok }); ops.set(x.a, o);
  }
  const v = [...ops.values()].filter(o => o.n >= 3).map(o => {
    o.pn = o.n - o.rn; o.pok = o.ok - o.rok;
    o.pr = o.pn ? o.pok / o.pn : 0; o.rr = o.rn ? o.rok / o.rn : 0;
    // same rule as the app's notice, a little stricter for a public post
    o.drop = o.rn >= 20 && o.pn >= 50 && o.pr >= 0.6 && o.rr <= o.pr - 0.35;
    o.best = o.k.filter(x => x.n >= 3).sort((p, q) => (q.ok / q.n) - (p.ok / p.n) || q.n - p.n);
    o.now = o.k.filter(x => x.rn >= 3 && x.rok / x.rn >= 0.6).sort((p, q) => (q.rok / q.rn) - (p.rok / p.rn) || q.rn - p.rn);
    return o;
  }).sort((p, q) => q.n - p.n);
  MEMO = { t: Date.now(), v };
  return v;
}

// the bot's /radar answer
export async function botText(db, en) {
  const ops = (await summary(db)).filter(o => ISP[o.a]).slice(0, 10); // only operators we can name (AS29049 is Iran's route through Baku: many operators)
  if (!ops.length) return en ? '📡 Filter Radar\n\nNot enough reports in the last 24 hours yet.' : '📡 رادار فیلترینگ\n\nهنوز در ۲۴ ساعت گذشته گزارش کافی نرسیده.';
  const L = [en ? '📡 Filter Radar — last 24 hours\nWhich kind of connection works on which operator, from anonymous reports of V2Fall apps.\n' : '📡 رادار فیلترینگ — ۲۴ ساعت گذشته\nکدام نوع اتصال روی کدام اپراتور جواب می‌دهد، از گزارش‌های ناشناس برنامه‌های V2Fall.\n'];
  for (const o of ops) {
    const p = pct(o.ok, o.n), dot = o.drop ? '⚠️' : p >= 70 ? '🟢' : p >= 40 ? '🟡' : '🔴';
    const b = o.best.slice(0, 2).map(x => label(x.k) + ' ' + (en ? pct(x.ok, x.n) + '%' : FA(pct(x.ok, x.n)) + '٪'));
    const cl = calLine(await calendar(db, o.a).catch(() => null), en);
    L.push(`${dot} ${ispName(o.a, en)}: ${en ? p + '%' : FA(p) + '٪'}${o.drop ? (en ? ' — sudden drop in the last 2 h' : ' — افت ناگهانی در ۲ ساعت اخیر') : ''}` + (b.length ? '\n   ' + (en ? 'best: ' : 'بهترین: ') + b.join(en ? ', ' : '، ') : '') + (cl ? '\n   ⏰ ' + cl : ''));
  }
  L.push(en ? '\n🔒 Only counters per operator are kept: no IP, no server, no user.' : '\n🔒 فقط شمارنده برای هر اپراتور نگه داشته می‌شود: نه IP، نه سرور، نه کاربر.');
  return L.join('\n');
}

const SIGN = '🆔 @v2fall\n⬇️ دانلود رایگان: v2fall.com\n📺 یوتیوب: youtube.com/@v2fall\n🤖 ربات: @v2fallbot';
const tag = s => '#' + String(s).replace(/[\s‌\-]+/g, '_');

// channel post on a sudden drop (one per operator until it is back), and one when it is back.
// Runs at most every 20 minutes (KV lock), from the report path of functions/radar.js.
export async function alertCheck(env) {
  const kv = env.CODES, db = env.STATS;
  if (!kv || !db || !env.TELEGRAM_BOT_TOKEN) return;
  if (await kv.get('rad:chk')) return;
  await kv.put('rad:chk', '1', { expirationTtl: 1200 });
  MEMO = null;
  const ops = await summary(db), chat = env.RADAR_CHANNEL || '@v2fall';
  for (const o of ops) {
    if (!ISP[o.a]) continue; // only operators we can name
    const key = 'rad:al:' + o.a, was = await kv.get(key), name = ispName(o.a, false);
    let text = '';
    if (o.drop && !was) {
      const now = o.now.slice(0, 4).map(x => `• ${label(x.k)} — ${FA(pct(x.rok, x.rn))}٪`);
      text = `⚠️ اختلال در اینترنت ${name}\n\nدر دو ساعت گذشته موفقیت اتصال‌ها روی ${name} از حدود ${FA(Math.round(o.pr * 100))}٪ به ${FA(Math.round(o.rr * 100))}٪ افتاده.\n\n` +
        (now.length ? `✅ چیزهایی که همین الان روی ${name} هنوز جواب می‌دهد:\n${now.join('\n')}\n\n` : '') +
        `💡 در برنامه، کارت «رادار فیلترینگ» را ببین و تست پینگ بزن؛ اگر سرورت قطع است، حالت قطعی و Ashflake را امتحان کن.\n📡 رادار زنده: v2fall.com/radar\n🔒 داده‌ها ناشناس است: فقط شمارنده برای هر اپراتور.\n\n#رادار_فیلترینگ #اختلال ${tag(name)}\n\n${SIGN}`;
      await kv.put(key, JSON.stringify({ t: Date.now(), pr: o.pr }), { expirationTtl: 86400 * 2 });
    } else if (was && !o.drop && o.rn >= 15 && o.rr >= Math.min(JSON.parse(was).pr, o.pr) - 0.1) {
      text = `✅ ${name} بهتر شد\n\nموفقیت اتصال‌ها روی ${name} در دو ساعت گذشته دوباره به حدود ${FA(Math.round(o.rr * 100))}٪ برگشته.\n\n📡 رادار زنده: v2fall.com/radar\n\n#رادار_فیلترینگ ${tag(name)}\n\n${SIGN}`;
      await kv.delete(key);
    }
    if (text) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true } }) });
      // people who asked the bot for this operator's alerts get it directly too (tgsub:<operator>:<chat>)
      try {
        let cur; do {
          const l = await kv.list({ prefix: 'tgsub:' + o.a + ':', cursor: cur });
          for (const k of l.keys) {
            const to = k.name.split(':')[2];
            const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: to, text, link_preview_options: { is_disabled: true } }) });
            if (r.status === 403) await kv.delete(k.name); // blocked the bot: stop
            await new Promise(z => setTimeout(z, 40)); // well under Telegram's 30 messages a second
          }
          cur = l.list_complete ? null : l.cursor;
        } while (cur);
      } catch (e) {}
    }
  }  const post = text => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true } }) });
  await siteAlertCheck(env, post).catch(() => {});
  // international speed: once a day per operator when it is clearly slower than the week before
  const sp = await speedSummary(db).catch(() => null), day = new Date(Date.now() + 12600000).toISOString().slice(0, 10);
  for (const o of (sp && sp.ops) || []) {
    if (!o.worse || !ISP[o.a]) continue;
    const key = 'rad:spd:' + o.a + ':' + day; if (await kv.get(key)) continue;
    await kv.put(key, '1', { expirationTtl: 86400 * 2 });
    const name = ISP[o.a][0];
    await post(`🐢 اینترنت بین‌الملل ${name} امروز کندتر شده\n\n${FA(o.slow[6])}٪ اندازه‌گیری‌های امروز روی ${name} کمتر از ۱ مگابیت بوده؛ در هفتهٔ پیش ${FA(o.base)}٪.${o.med !== null ? '\nسرعت معمول امروز: ' + bandFa(o.med) : ''}\n\n📡 v2fall.com/radar\n🔒 از اندازه‌گیری‌های ناشناس برنامه‌های V2Fall (فقط بازهٔ سرعت و اپراتور).\n\n#رادار_فیلترینگ #کندی_اینترنت ${tag(name)}\n\n${SIGN}`);
  }
  // forecast for the bot's alert subscribers: once a day, from 16:00 Tehran, to people who asked for an operator's
  // alerts, when a window of 60%+ risk starts within the next 8 hours. Only to them, never the channel.
  const tehH = new Date(Date.now() + 12600000).getUTCHours();
  if (tehH >= 16 && tehH < 21) {
    for (const a of Object.keys(ISP).map(Number)) {
      const key = 'rad:fc:' + a + ':' + day; if (await kv.get(key)) continue;
      const pre = await kv.list({ prefix: 'tgsub:' + a + ':', limit: 1 }); if (!pre.keys.length) continue;
      await kv.put(key, '1', { expirationTtl: 86400 * 2 });
      const f = await forecast(db, a).catch(() => null), w = f && f.enough && f.wins.find(x => x.risk >= 60 && x.inH > 0 && x.inH <= 8);
      if (!w) continue;
      const name = ISP[a][0];
      const text = `🔮 پیش‌بینی رادار برای ${name}\n\nامشب ساعت ${FA(w.from)} تا ${FA(w.to)} احتمال اختلال بالاست: در ${FA(w.of)} روز گذشته، ${FA(w.bad)} روز همین ساعت اتصال‌ها روی ${name} بدتر شده.\n\n💡 از الان یک سرور پشتیبان آماده کن یا در برنامه «جابه‌جایی خودکار» را روشن کن.\n📡 v2fall.com/radar`;
      try {
        let cur; do {
          const l = await kv.list({ prefix: 'tgsub:' + a + ':', cursor: cur });
          for (const k of l.keys) {
            const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: k.name.split(':')[2], text, link_preview_options: { is_disabled: true } }) });
            if (r.status === 403) await kv.delete(k.name);
            await new Promise(z => setTimeout(z, 40));
          }
          cur = l.list_complete ? null : l.cursor;
        } while (cur);
      } catch (e) {}
    }
  }
  // early warning: several operators getting worse together (a drop on 2 or more, or drops and slowdowns on 3 or
  // more) is how the wide disruptions have started. Not a forecast: a nudge to get ready while the internet is still
  // open. At most once every 6 hours; the app reads the same note (/radar?w=1).
  const drops = ops.filter(o => ISP[o.a] && o.drop).map(o => o.a), slows = ((sp && sp.ops) || []).filter(o => ISP[o.a] && o.worse).map(o => o.a);
  const both = [...new Set([...drops, ...slows])];
  if ((drops.length >= 2 || both.length >= 3) && !(await kv.get('rad:wide'))) {
    await kv.put('rad:wide', JSON.stringify({ t: Date.now(), ops: both }), { expirationTtl: 6 * 3600 });
    const names = both.map(a => ISP[a][0]).join('، ');
    await post(`🚨 بدتر شدن هم‌زمان اینترنت روی چند اپراتور\n\nدر چند ساعت گذشته اتصال‌ها روی ${names} هم‌زمان بدتر شده. اختلال‌های گسترده معمولاً همین‌طور شروع شده‌اند؛ این پیش‌بینی قطعی نیست، ولی آماده بودن ضرری ندارد.\n\n✅ تا اینترنت باز است:\n• در V2Fall: تنظیمات ← حالت قطعی اینترنت ← «آماده شو برای قطعی» (اشتراک‌ها به‌روز، DNSهای سالم، مسیرهای اضطراری)\n• برنامه را برای خانواده و دوستان هم بفرست\n\n📡 رادار زنده: v2fall.com/radar\n\n#رادار_فیلترینگ #قطعی_اینترنت #اختلال\n\n${SIGN}`);
  }
}

// ---- disruption calendar: when an operator is usually worse, from the last 14 days of the same counters.
// By hour of the day in Tehran (14 samples per hour); weekdays only when each has enough reports. A window is
// "risky" when its success is clearly under the operator's own average (12 points or more), with enough reports.
const TEH = h => new Date(h * 3600000 + 12600000); // UTC hour index → a Date whose UTC fields are Tehran's (+3:30)
export async function calendar(db, a) {
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT h, SUM(n) AS n, SUM(ok) AS ok, SUM(ms) AS ms FROM radar WHERE a = ? AND h > ? GROUP BY h').bind(a, now - 24 * 14).all();
  const hr = Array.from({ length: 24 }, () => [0, 0, 0]), dw = Array.from({ length: 7 }, () => [0, 0]);
  let N = 0, OK = 0;
  for (const x of r.results || []) {
    const t = TEH(x.h), H = t.getUTCHours(), D = t.getUTCDay();
    hr[H][0] += x.n; hr[H][1] += x.ok; hr[H][2] += x.ms || 0; dw[D][0] += x.n; dw[D][1] += x.ok; N += x.n; OK += x.ok;
  }
  const avg = N ? OK / N : 0, rate = v => v[0] ? v[1] / v[0] : null;
  const hours = hr.map(v => [v[0], v[0] >= 5 ? Math.round(rate(v) * 100) : null, v[1] ? Math.round(v[2] * 10 / v[1]) : null]); // [reports, %, delay bucket ×10]
  const bad = hr.map(v => v[0] >= 15 && rate(v) <= avg - 0.12);
  // join neighbouring risky hours into windows (across midnight too)
  const wins = [];
  for (let s = 0; s < 24; s++) {
    if (!bad[s] || bad[(s + 23) % 24] && !bad.every(Boolean)) continue;
    let e = s; while (bad[(e + 1) % 24] && (e + 1) % 24 !== s) e = (e + 1) % 24;
    const span = []; for (let i = s; ; i = (i + 1) % 24) { span.push(i); if (i === e) break; }
    const n = span.reduce((t, i) => t + hr[i][0], 0), ok = span.reduce((t, i) => t + hr[i][1], 0);
    wins.push({ from: s, to: (e + 1) % 24, rate: Math.round(ok * 100 / n), n });
  }
  wins.sort((p, q) => p.rate - q.rate);
  const days = dw.every(v => v[0] >= 20) ? dw.map(v => Math.round(rate(v) * 100)) : null;
  // the next risky window starting within 12 hours (Tehran time), for "tonight from 20:00"
  const nowH = TEH(now).getUTCHours(); let next = null;
  for (const w of wins) { const inH = (w.from - nowH + 24) % 24; const inside = (nowH - w.from + 24) % 24 < (w.to - w.from + 24) % 24 || w.to === w.from; if (inside) { next = { ...w, inH: 0 }; break; } if (inH <= 12 && (!next || inH < next.inH)) next = { ...w, inH }; }
  const days2 = dw.map(v => [v[0], v[0] >= 10 ? Math.round(rate(v) * 100) : null]); // Sunday first, [reports, %]
  return { a, n: N, avg: Math.round(avg * 100), hours, wins: wins.slice(0, 3), days, days2, next, nowH, enough: N >= 200 };
}
const faN = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
export function calLine(c, en) {
  if (!c || !c.enough || !c.wins.length) return '';
  const w = c.wins[0];
  return en ? `usually worse ${String(w.from).padStart(2, '0')}:00–${String(w.to).padStart(2, '0')}:00 (${w.rate}% vs ${c.avg}%)` : `معمولاً ساعت ${faN(w.from)} تا ${faN(w.to)} بدتر است (${faN(w.rate)}٪ در برابر ${faN(c.avg)}٪)`;
}

// ---- site radar: is each of a fixed list of popular sites reachable WITHOUT the VPN on each operator, from the
// app's "status of popular sites" check (only with anonymous reports on). Stored per (hour, operator, site): two
// counters. Same list and order in the app (RADAR_SITES) and on the site's radar page.
export async function wideNote(kv) { try { const v = kv && await kv.get('rad:wide'); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

export const SITES = [['instagram.com', 'اینستاگرام'], ['youtube.com', 'یوتیوب'], ['x.com', 'ایکس'], ['telegram.org', 'تلگرام'], ['whatsapp.com', 'واتس‌اپ'], ['chatgpt.com', 'ChatGPT'], ['github.com', 'گیت‌هاب'], ['discord.com', 'دیسکورد'], ['play.google.com', 'گوگل‌پلی'], ['wikipedia.org', 'ویکی‌پدیا'], ['linkedin.com', 'لینکدین'], ['spotify.com', 'اسپاتیفای']];
let siteReady = false;
export async function siteInit(db) {
  if (siteReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS radar_site (h INTEGER NOT NULL, a INTEGER NOT NULL, s INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (h, a, s))').run();
  siteReady = true;
}
// report: base64url of {"v":1,"a":asn,"r":[[site, ok], …]}
export async function siteReport(db, d) {
  let j; try { j = JSON.parse(atob(String(d).replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return 0; }
  if (!j || j.v !== 1 || !Number.isInteger(j.a) || j.a < 1 || j.a > 4294967295 || !Array.isArray(j.r)) return 0;
  const rows = j.r.slice(0, SITES.length).filter(x => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0 && x[0] < SITES.length && (x[1] === 0 || x[1] === 1));
  if (!rows.length) return 0;
  await siteInit(db);
  const h = Math.floor(Date.now() / 3600000);
  await dayInit(db, null);
  await db.batch(rows.flatMap(x => [db.prepare('INSERT INTO radar_site (h, a, s, n, ok) VALUES (?, ?, ?, 1, ?) ON CONFLICT(h, a, s) DO UPDATE SET n = n + 1, ok = ok + excluded.ok').bind(h, j.a, x[0], x[1]), siteDayRow(db, h, j.a, x[0], x[1])]));
  if (Math.random() < 0.02) await db.prepare('DELETE FROM radar_site WHERE h < ?').bind(h - 24 * 15).run();
  return rows.length;
}
// last 24 h per operator and site, and the last 3 h against the 21 before: "blocked since" / "opened since"
export async function siteSummary(db) {
  await siteInit(db);
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT a, s, SUM(n) AS n, SUM(ok) AS ok, SUM(CASE WHEN h > ? THEN n ELSE 0 END) AS rn, SUM(CASE WHEN h > ? THEN ok ELSE 0 END) AS rok FROM radar_site WHERE h > ? GROUP BY a, s').bind(now - 3, now - 3, now - 24).all();
  const ops = new Map();
  for (const x of r.results || []) {
    const o = ops.get(x.a) || { a: x.a, n: 0, s: [] }; o.n += x.n;
    const pn = x.n - x.rn, pok = x.ok - x.rok, rr = x.rn ? x.rok / x.rn : null, pr = pn ? pok / pn : null;
    const change = x.rn >= 3 && pn >= 5 ? (rr <= 0.3 && pr >= 0.7 ? 'blocked' : rr >= 0.7 && pr <= 0.3 ? 'opened' : '') : '';
    o.s.push({ s: x.s, n: x.n, ok: x.ok, now: x.rn >= 3 ? Math.round(rr * 100) : null, change });
    ops.set(x.a, o);
  }
  return { now, sites: SITES.map(x => x[0]), ops: [...ops.values()].filter(o => o.n >= 5).sort((p, q) => q.n - p.n) };
}
// a channel post when a site gets blocked or opens on a named operator (once per change, kept 7 days)
export async function siteAlertCheck(env, post) {
  const kv = env.CODES; if (!kv) return;
  const sum = await siteSummary(env.STATS);
  for (const o of sum.ops) {
    if (!ISP[o.a]) continue;
    for (const x of o.s) {
      if (!x.change) continue;
      const key = 'rad:site:' + o.a + ':' + x.s, was = await kv.get(key);
      if (was === x.change) continue;
      await kv.put(key, x.change, { expirationTtl: 86400 * 7 });
      if (!was && x.change === 'opened') continue; // the first time we see a site at all, only a block is news
      await siteEvent(kv, { type: x.change, a: o.a, s: x.s, h: sum.now, from: sum.now - 2 });
      const op = ISP[o.a][0], site = SITES[x.s][1];
      await post(x.change === 'blocked'
        ? `🚫 ${site} روی ${op} فیلتر شد\n\nدر سه ساعت گذشته ${site} روی ${op} بدون VPN باز نمی‌شود، در حالی که پیش از آن باز می‌شد.\n\n📡 رادار سایت‌ها: v2fall.com/radar\n🔒 از گزارش‌های ناشناس برنامه‌های V2Fall: فقط «باز شد / نشد» و اپراتور.\n\n#رادار_فیلترینگ #فیلترینگ ${tag(op)}\n\n${SIGN}`
        : `✅ ${site} روی ${op} باز شد\n\nدر سه ساعت گذشته ${site} روی ${op} بدون VPN باز می‌شود، در حالی که پیش از آن فیلتر بود.\n\n📡 رادار سایت‌ها: v2fall.com/radar\n\n#رادار_فیلترینگ ${tag(op)}\n\n${SIGN}`);
    }
  }
}

// ---- international speed index: the short direct download in the app's "Filtering type" check (the user's own
// line to Cloudflare, not the VPN), as a band only: 0 <250 kbps, 1 <1 Mbps, 2 <4 Mbps, 3 <16 Mbps, 4 above.
// Per (hour, operator, band): one counter. Public: each operator's usual band today and the share of slow
// measurements (<1 Mbps) per day for 7 days, so throttling shows as a jump.
export const BANDS = [[0, 250], [250, 1000], [1000, 4000], [4000, 16000], [16000, 0]];
let spdReady = false;
async function spdInit(db) {
  if (spdReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS radar_speed (h INTEGER NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (h, a, b))').run();
  spdReady = true;
}
export const bandOf = kbps => kbps < 250 ? 0 : kbps < 1000 ? 1 : kbps < 4000 ? 2 : kbps < 16000 ? 3 : 4;
export async function speedReport(db, d) {
  let j; try { j = JSON.parse(atob(String(d).replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return 0; }
  if (!j || j.v !== 1 || !Number.isInteger(j.a) || j.a < 1 || j.a > 4294967295 || !Number.isInteger(j.b) || j.b < 0 || j.b > 4) return 0;
  await spdInit(db);
  const h = Math.floor(Date.now() / 3600000);
  await db.prepare('INSERT INTO radar_speed (h, a, b, n) VALUES (?, ?, ?, 1) ON CONFLICT(h, a, b) DO UPDATE SET n = n + 1').bind(h, j.a, j.b).run();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM radar_speed WHERE h < ?').bind(h - 24 * 15).run();
  return 1;
}
export async function speedSummary(db) {
  await spdInit(db);
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT h, a, b, SUM(n) AS n FROM radar_speed WHERE h > ? GROUP BY h, a, b').bind(now - 24 * 7).all();
  const ops = new Map();
  for (const x of r.results || []) {
    const o = ops.get(x.a) || { a: x.a, today: [0, 0, 0, 0, 0], days: Array.from({ length: 7 }, () => [0, 0]) };
    const age = now - x.h, day = Math.min(6, Math.floor(age / 24));
    if (age < 24) o.today[x.b] += x.n;
    o.days[6 - day][0] += x.n; if (x.b <= 1) o.days[6 - day][1] += x.n;
    ops.set(x.a, o);
  }
  const list = [...ops.values()].map(o => {
    const n = o.today.reduce((t, v) => t + v, 0);
    let acc = 0, med = null; for (let b = 0; b < 5 && n; b++) { acc += o.today[b]; if (acc * 2 >= n) { med = b; break; } }
    const slow = o.days.map(d => d[0] >= 5 ? Math.round(d[1] * 100 / d[0]) : null);
    const prev = o.days.slice(0, 6).filter(d => d[0] >= 5), pn = prev.reduce((t, d) => t + d[0], 0), ps = prev.reduce((t, d) => t + d[1], 0);
    const base = pn >= 15 ? Math.round(ps * 100 / pn) : null;
    return { a: o.a, n, med, slow, base, worse: n >= 10 && base !== null && slow[6] !== null && slow[6] >= base + 20 };
  }).filter(o => o.n >= 3 || o.slow.some(v => v !== null)).sort((p, q) => q.n - p.n);
  return { now, bands: BANDS, ops: list };
}
const BAND_FA = ['زیر ۲۵۰ کیلوبیت', '۰.۲۵ تا ۱ مگابیت', '۱ تا ۴ مگابیت', '۴ تا ۱۶ مگابیت', 'بیشتر از ۱۶ مگابیت'];
export const bandFa = b => BAND_FA[b] || '';

// ---- incidents: every sudden drop of the last 14 days on each named operator, worked out from the same hourly
// counters (no extra storage, so the archive is there from day one). An incident starts when the last 2 hours are
// 35 points or more under the 22 hours before them (the channel alert's rule, slightly looser on report counts)
// and ends when 2 hours are back within 15 points of that level. Overlapping incidents on 2 or more operators are
// marked «wide». Site blocks / openings come from the site alerts (rad:sev, kept 30 days).
export async function incidents(db, kv) {
  const now = Math.floor(Date.now() / 3600000), from = now - 24 * 14;
  const r = await db.prepare('SELECT a, h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE h > ? GROUP BY a, h').bind(from - 24).all();
  const by = new Map();
  for (const x of r.results || []) { if (!ISP[x.a]) continue; const m = by.get(x.a) || new Map(); m.set(x.h, [x.n, x.ok]); by.set(x.a, m); }
  const sum = (m, a, b) => { let n = 0, ok = 0; for (let h = a; h <= b; h++) { const v = m.get(h); if (v) { n += v[0]; ok += v[1]; } } return [n, ok]; };
  const out = [];
  for (const [a, m] of by) {
    let cur = null;
    for (let h = from; h <= now; h++) {
      const [rn, rok] = sum(m, h - 1, h), rr = rn ? rok / rn : null;
      if (!cur) {
        const [bn, bok] = sum(m, h - 23, h - 2), br = bn ? bok / bn : 0;
        if (bn >= 40 && br >= 0.6 && rn >= 15 && rr <= br - 0.35) cur = { a, from: h - 1, base: br, low: rr, n: rn };
      } else {
        if (rn >= 8 && rr >= cur.base - 0.15) { out.push({ ...cur, to: h - 1 }); cur = null; }
        else { if (rn >= 8 && rr < cur.low) cur.low = rr; cur.n += m.get(h) ? m.get(h)[0] : 0; }
      }
    }
    if (cur) out.push({ ...cur, to: null }); // still going
  }
  for (const e of out) e.wide = out.some(o => o !== e && o.a !== e.a && o.from <= (e.to ?? now) && (o.to ?? now) >= e.from);
  const ev = out.map(e => ({ type: 'drop', a: e.a, from: e.from, to: e.to, base: Math.round(e.base * 100), low: Math.round(e.low * 100), n: e.n, wide: e.wide }));
  try {
    await dayInit(db, kv);
    if (ev.length) await db.batch(ev.map(e => db.prepare('INSERT INTO radar_inc (a, f, t, base, low, n, wide) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(a, f) DO UPDATE SET t = excluded.t, base = excluded.base, low = excluded.low, n = excluded.n, wide = MAX(wide, excluded.wide)').bind(e.a, e.from, e.to, e.base, e.low, e.n, e.wide ? 1 : 0)));
    const old = await db.prepare('SELECT a, f, t, base, low, n, wide FROM radar_inc WHERE f <= ? ORDER BY f DESC LIMIT 200').bind(from).all();
    for (const x of old.results || []) if (ISP[x.a]) ev.push({ type: 'drop', a: x.a, from: x.f, to: x.t ?? x.f + 1, base: x.base, low: x.low, n: x.n, wide: !!x.wide });
  } catch (e) {}
  try { const s = JSON.parse(await kv.get('rad:sev') || '[]'); for (const x of s) ev.push(x); } catch (e) {}
  ev.sort((p, q) => (q.from ?? q.h) - (p.from ?? p.h));
  return { now, ev: ev.slice(0, 300) };
}
async function siteEvent(kv, x) {
  try { const l = JSON.parse(await kv.get('rad:sev') || '[]'); l.unshift(x); await kv.put('rad:sev', JSON.stringify(l.slice(0, 500))); } catch (e) {}
}

// ---- trends: the whole country hour by hour (8 days, every named operator together) and each operator day by day
// (14 days, Tehran days) — the «status page» strips of the site and the app
export async function trends(db) {
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT a, h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE h > ? GROUP BY a, h').bind(now - 24 * 14).all();
  const nat = new Map(), days = {};
  const dayOf = h => Math.floor((h * 3600000 + 12600000) / 864e5), today = dayOf(now);
  for (const x of r.results || []) {
    if (!ISP[x.a]) continue;
    if (x.h > now - 24 * 8) { const v = nat.get(x.h) || [0, 0]; v[0] += x.n; v[1] += x.ok; nat.set(x.h, v); }
    const d = 13 - (today - dayOf(x.h)); if (d < 0 || d > 13) continue;
    const o = days[x.a] || (days[x.a] = Array.from({ length: 14 }, () => [0, 0])); o[d][0] += x.n; o[d][1] += x.ok;
  }
  return { now, nat: [...nat.entries()].sort((p, q) => p[0] - q[0]).map(([h, v]) => [h, v[0], v[1]]), days };
}
// ---- each popular site day by day (14 days, all operators together, or one operator)
export async function siteTrends(db, a) {
  await siteInit(db);
  const now = Math.floor(Date.now() / 3600000), dayOf = h => Math.floor((h * 3600000 + 12600000) / 864e5), today = dayOf(now);
  const r = a ? await db.prepare('SELECT h, s, SUM(n) AS n, SUM(ok) AS ok FROM radar_site WHERE h > ? AND a = ? GROUP BY h, s').bind(now - 24 * 14, a).all()
    : await db.prepare('SELECT h, s, SUM(n) AS n, SUM(ok) AS ok FROM radar_site WHERE h > ? GROUP BY h, s').bind(now - 24 * 14).all();
  const s = SITES.map(() => Array.from({ length: 14 }, () => [0, 0]));
  for (const x of r.results || []) { const d = 13 - (today - dayOf(x.h)); if (d < 0 || d > 13 || !s[x.s]) continue; s[x.s][d][0] += x.n; s[x.s][d][1] += x.ok; }
  return { now, a: a || 0, sites: SITES.map(x => x[0]), days: s };
}

// ---- long-term history: the hourly tables keep 15 days; these daily ones (Tehran days) are kept for good, so the
// radar can show months and years. Written at report time next to the hourly rows; filled once from what the
// hourly tables still hold.
export const dayOf = h => Math.floor((h * 3600000 + 12600000) / 864e5);
let dayReady = false;
export async function dayInit(db, kv) {
  if (dayReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS radar_day (d INTEGER NOT NULL, a INTEGER NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (d, a, k))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS radar_site_day (d INTEGER NOT NULL, a INTEGER NOT NULL, s INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (d, a, s))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS radar_inc (a INTEGER NOT NULL, f INTEGER NOT NULL, t INTEGER, base INTEGER, low INTEGER, n INTEGER, wide INTEGER, PRIMARY KEY (a, f))').run();
  if (kv && !(await kv.get('rad:dayfill'))) {
    await kv.put('rad:dayfill', '1');
    await siteInit(db);
    // the first fill: every day the 15-day tables still have (today too; reports from now on add to it)
    await db.prepare('INSERT INTO radar_day (d, a, k, n, ok) SELECT (h * 3600000 + 12600000) / 86400000, a, k, SUM(n), SUM(ok) FROM radar GROUP BY 1, a, k ON CONFLICT(d, a, k) DO NOTHING').run();
    await db.prepare('INSERT INTO radar_site_day (d, a, s, n, ok) SELECT (h * 3600000 + 12600000) / 86400000, a, s, SUM(n), SUM(ok) FROM radar_site GROUP BY 1, a, s ON CONFLICT(d, a, s) DO NOTHING').run();
  }
  dayReady = true;
}
export const dayRow = (db, h, a, k, ok) => db.prepare('INSERT INTO radar_day (d, a, k, n, ok) VALUES (?, ?, ?, 1, ?) ON CONFLICT(d, a, k) DO UPDATE SET n = n + 1, ok = ok + excluded.ok').bind(dayOf(h), a, k, ok);
export const siteDayRow = (db, h, a, s, ok) => db.prepare('INSERT INTO radar_site_day (d, a, s, n, ok) VALUES (?, ?, ?, 1, ?) ON CONFLICT(d, a, s) DO UPDATE SET n = n + 1, ok = ok + excluded.ok').bind(dayOf(h), a, s, ok);

// ?long=1 → every day so far (up to 3 years): the whole country and each named operator
export async function longTrend(db, kv) {
  await dayInit(db, kv);
  const today = dayOf(Math.floor(Date.now() / 3600000));
  const r = await db.prepare('SELECT d, a, SUM(n) AS n, SUM(ok) AS ok FROM radar_day WHERE d > ? GROUP BY d, a').bind(today - 1100).all();
  const nat = new Map(), ops = {};
  for (const x of r.results || []) {
    if (!ISP[x.a]) continue;
    const v = nat.get(x.d) || [x.d, 0, 0]; v[1] += x.n; v[2] += x.ok; nat.set(x.d, v);
    (ops[x.a] || (ops[x.a] = [])).push([x.d, x.n, x.ok]);
  }
  for (const a in ops) ops[a].sort((p, q) => p[0] - q[0]);
  return { today, nat: [...nat.values()].sort((p, q) => p[0] - q[0]), ops };
}
// ?kinds=1[&a=asn] → the main kinds of connection day by day, last 30 days: when each one got hit
export async function kindTrend(db, kv, a) {
  await dayInit(db, kv);
  const today = dayOf(Math.floor(Date.now() / 3600000)), from = today - 29;
  const r = a ? await db.prepare('SELECT d, k, SUM(n) AS n, SUM(ok) AS ok FROM radar_day WHERE d >= ? AND a = ? GROUP BY d, k').bind(from, a).all()
    : await db.prepare('SELECT d, k, SUM(n) AS n, SUM(ok) AS ok FROM radar_day WHERE d >= ? GROUP BY d, k').bind(from).all();
  // a family = protocol + its kind of security (VLESS Reality, VLESS TLS, Hysteria2, WireGuard…): transports apart
  // split the reports too thin to read
  const fam = k => { const [p, , s] = String(k).split('|'); return p + (s && s !== 'none' && ['VLESS', 'VMESS', 'TROJAN'].includes(p) ? '|' + s : ''); };
  const by = new Map();
  for (const x of r.results || []) {
    const f = fam(x.k), o = by.get(f) || { k: f, n: 0, days: Array.from({ length: 30 }, () => [0, 0]) };
    o.n += x.n; const i = x.d - from; if (i >= 0 && i < 30) { o.days[i][0] += x.n; o.days[i][1] += x.ok; }
    by.set(f, o);
  }
  const fams = [...by.values()].filter(o => o.n >= 30).sort((p, q) => q.n - p.n).slice(0, 8);
  return { today, from, a: a || 0, fams: fams.map(o => ({ k: o.k, label: (([p, sec]) => (P[p] || p) + (sec ? ' ' + ({ reality: 'Reality', tls: 'TLS' }[sec] || sec) : ''))(o.k.split('|')), n: o.n, days: o.days })) };
}

// ---- one incident: what was stored plus every named operator's hours from 12 h before to 12 h after
export async function incidentDetail(db, kv, id) {
  const [a, f] = id.split('-').map(Number);
  await dayInit(db, kv);
  let x = await db.prepare('SELECT a, f, t, base, low, n, wide FROM radar_inc WHERE a = ? AND f = ?').bind(a, f).first();
  if (!x) { await incidents(db, kv); x = await db.prepare('SELECT a, f, t, base, low, n, wide FROM radar_inc WHERE a = ? AND f = ?').bind(a, f).first(); }
  if (!x || !ISP[x.a]) return null;
  const now = Math.floor(Date.now() / 3600000), to = x.t ?? now, h0 = x.f - 12, h1 = Math.min(now, to + 12);
  const r = await db.prepare('SELECT a, h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE h >= ? AND h <= ? GROUP BY a, h').bind(h0, h1).all();
  const ops = {};
  for (const y of r.results || []) { if (!ISP[y.a]) continue; (ops[y.a] || (ops[y.a] = [])).push([y.h, y.n, y.ok]); }
  // other operators that fell at the same time
  const also = (await db.prepare('SELECT a, f, t, low FROM radar_inc WHERE a != ? AND f <= ? AND COALESCE(t, ?) >= ?').bind(a, to, now, x.f).all()).results || [];
  return { now, inc: { a: x.a, from: x.f, to: x.t, base: x.base, low: x.low, n: x.n, wide: !!x.wide }, also: also.filter(y => ISP[y.a]).map(y => ({ a: y.a, from: y.f, to: y.t, low: y.low })), h0, h1, ops };
}

// ---- forecast: the next 24 hours of one operator, from how each hour of the day went on each of the last 14 days.
// An hour of a day is «bad» when it had 4+ reports and worked 15 points under that operator's 14-day level (or under
// 50%). risk = bad days / days with reports for that hour. Not a model of the future: «on k of the last n days this
// hour was bad». Hours in a row at 40%+ make a window.
export async function forecast(db, a) {
  const now = Math.floor(Date.now() / 3600000);
  const r = await db.prepare('SELECT h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE a = ? AND h > ? GROUP BY h').bind(a, now - 24 * 14).all();
  let N = 0, OK = 0; const rows = r.results || [];
  for (const x of rows) { N += x.n; OK += x.ok; }
  const nowH = TEH(now).getUTCHours();
  if (N < 150) return { a, now, nowH, enough: false, hours: [], wins: [] };
  const avg = OK / N, days = Array.from({ length: 24 }, () => [0, 0]); // per hour of day: [days with reports, bad days]
  for (const x of rows) {
    if (x.n < 4) continue;
    const H = TEH(x.h).getUTCHours(), rate = x.ok / x.n;
    days[H][0]++; if (rate <= avg - 0.15 || rate < 0.5) days[H][1]++;
  }
  const hours = [];
  for (let i = 0; i < 24; i++) { const H = (nowH + i) % 24, d = days[H]; hours.push([H, d[0], d[1], d[0] >= 4 ? Math.round(100 * d[1] / d[0]) : null]); } // [hour, days, bad days, risk %]
  const wins = [];
  for (let i = 0; i < 24; i++) {
    if (!(hours[i][3] >= 40)) continue;
    let j = i; while (j + 1 < 24 && hours[j + 1][3] >= 40) j++;
    const span = hours.slice(i, j + 1), top = span.reduce((m, x) => (x[3] > m[3] ? x : m), span[0]);
    wins.push({ inH: i, from: hours[i][0], to: (hours[j][0] + 1) % 24, risk: top[3], bad: top[2], of: top[1] });
    i = j;
  }
  return { a, now, nowH, enough: true, avg: Math.round(avg * 100), hours, wins: wins.slice(0, 4) };
}
export function fcLine(f, en) {
  if (!f || !f.enough || !f.wins.length) return '';
  const w = f.wins[0], fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const when = w.inH === 0 ? (en ? 'now' : 'الان') : (en ? `in ${w.inH} h` : `${fa(w.inH)} ساعت دیگر`);
  return en ? `${w.risk >= 70 ? 'High' : 'Some'} risk of disruption ${String(w.from).padStart(2, '0')}:00–${String(w.to).padStart(2, '0')}:00 (${when}; bad on ${w.bad} of the last ${w.of} days)`
    : `احتمال ${w.risk >= 70 ? 'بالای' : ''} اختلال ساعت ${fa(w.from)} تا ${fa(w.to)} (${when}؛ ${fa(w.bad)} روز از ${fa(w.of)} روز گذشته همین ساعت بد بوده)`.replace('احتمال  ', 'احتمال ');
}
