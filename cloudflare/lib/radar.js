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
    L.push(`${dot} ${ispName(o.a, en)}: ${en ? p + '%' : FA(p) + '٪'}${o.drop ? (en ? ' — sudden drop in the last 2 h' : ' — افت ناگهانی در ۲ ساعت اخیر') : ''}` + (b.length ? '\n   ' + (en ? 'best: ' : 'بهترین: ') + b.join(en ? ', ' : '، ') : ''));
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
  }
}
