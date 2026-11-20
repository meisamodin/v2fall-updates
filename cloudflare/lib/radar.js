// Filter Radar for the bot and the channel: one summary of the last 24 h per operator (from the D1 table that
// functions/radar.js fills), the /radar answer of @v2fallbot, and the automatic channel post when one operator
// suddenly gets much worse (and a second post when it is back). Nothing here is per user: only the counters.

export const ISP = { 197207: ['همراه اول', 'MCI'], 44244: ['ایرانسل', 'Irancell'], 58224: ['مخابرات', 'TCI'], 57218: ['رایتل', 'RighTel'], 31549: ['شاتل', 'Shatel'], 43754: ['آسیاتک', 'Asiatech'], 16322: ['پارس‌آنلاین', 'Pars Online'], 50810: ['مبین‌نت', 'Mobinnet'], 56402: ['های‌وب', 'HiWEB'], 25184: ['افرانت', 'Afranet'], 12880: ['زیرساخت', 'DCI'], 49100: ['پیشگامان', 'Pishgaman'], 44208: ['فن‌آوا', 'Fanava'], 39501: ['سامانتل', 'Samantel'], 42337: ['رسپینا', 'Respina'], 24631: ['فناپ‌تلکام', 'Fanap Telecom'], 48159: ['زیرساخت (TIC)', 'TIC'] };
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
  const v = [...ops.values()].filter(o => o.n >= 10).map(o => {
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
    if (text) await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true } }) });
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
  const r = await db.prepare('SELECT h, SUM(n) AS n, SUM(ok) AS ok FROM radar WHERE a = ? AND h > ? GROUP BY h').bind(a, now - 24 * 14).all();
  const hr = Array.from({ length: 24 }, () => [0, 0]), dw = Array.from({ length: 7 }, () => [0, 0]);
  let N = 0, OK = 0;
  for (const x of r.results || []) {
    const t = TEH(x.h), H = t.getUTCHours(), D = t.getUTCDay();
    hr[H][0] += x.n; hr[H][1] += x.ok; dw[D][0] += x.n; dw[D][1] += x.ok; N += x.n; OK += x.ok;
  }
  const avg = N ? OK / N : 0, rate = v => v[0] ? v[1] / v[0] : null;
  const hours = hr.map(v => [v[0], v[0] >= 15 ? Math.round(rate(v) * 100) : null]);
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
  return { a, n: N, avg: Math.round(avg * 100), hours, wins: wins.slice(0, 3), days, next, enough: N >= 200 };
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
  await db.batch(rows.map(x => db.prepare('INSERT INTO radar_site (h, a, s, n, ok) VALUES (?, ?, ?, 1, ?) ON CONFLICT(h, a, s) DO UPDATE SET n = n + 1, ok = ok + excluded.ok').bind(h, j.a, x[0], x[1])));
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
