// /stats — private statistics page. The first visitor sets the password (stored only as a salted hash);
// after that the page needs it. Login keeps a cookie for 30 days.
import { ensure } from '../lib/stats.js';
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function pbkdf(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
}
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const getMeta = async (db, k) => { const r = await db.prepare('SELECT v FROM meta WHERE k = ?1').bind(k).first(); return r ? r.v : null; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = (body, extra = {}) => new Response('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>آمار V2Fall</title><style>' + CSS + '</style></head><body><main>' + body + '</main></body></html>',
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra } });
const CSS = `:root{color-scheme:dark;--bg:#0b0f17;--card:#141a26;--line:#232c3d;--mut:#8b96ab;--acc:#4f8cff;--acc2:#38d39f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#e8edf6;font:15px/1.7 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:980px;margin:0 auto;padding:18px 16px 40px}h1{font-size:22px;margin:4px 0 2px}h2{font-size:16px;margin:0 0 10px}.mut{color:var(--mut);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
.big{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px}
.bars{display:flex;align-items:flex-end;gap:3px;height:120px;direction:ltr}.bars div{flex:1;background:var(--acc);border-radius:3px 3px 0 0;min-height:1px;position:relative}.bars.g div{background:var(--acc2)}
.bars div:hover::after{content:attr(data-t);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#000;padding:2px 6px;border-radius:6px;font-size:11px;white-space:nowrap}
.axis{display:flex;justify-content:space-between;direction:ltr;color:var(--mut);font-size:11px;margin-top:4px}
table{width:100%;border-collapse:collapse}td{padding:5px 2px;border-top:1px solid var(--line);font-size:13.5px}td.n{text-align:left;font-variant-numeric:tabular-nums;width:70px}
.meter{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:3px}.meter i{display:block;height:100%;background:var(--acc)}
form{display:grid;gap:10px;max-width:340px;margin:40px auto}input,button{font:inherit;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:inherit}button{background:var(--acc);border:0;font-weight:600;cursor:pointer}
.err{color:#ff7a7a}a{color:var(--acc)}`;
const login = (first, err) => html(`<form method="post"><h1>آمار V2Fall</h1>
  <div class="mut">${first ? 'اولین بار: یک رمز برای این صفحه بگذارید (حداقل ۸ حرف). بعد از این فقط با همین رمز باز می‌شود.' : 'رمز صفحهٔ آمار را وارد کنید.'}</div>
  ${err ? `<div class="err">${esc(err)}</div>` : ''}
  <input type="password" name="pw" autocomplete="${first ? 'new-password' : 'current-password'}" placeholder="رمز" required minlength="${first ? 8 : 1}" autofocus>
  ${first ? '<input type="password" name="pw2" autocomplete="new-password" placeholder="تکرار رمز" required minlength="8">' : ''}
  <button>${first ? 'ذخیرهٔ رمز و ورود' : 'ورود'}</button></form>`);
const noPw = () => html('<form><h1>آمار V2Fall</h1><div class="mut">این صفحه خصوصی است. در ربات تلگرام @v2fallbot (فقط از حساب مدیر) بنویسید /stats تا لینک ورود یک‌بارمصرف بیاید.</div></form>');
const cookieOf = (req) => ((req.headers.get('cookie') || '').match(/(?:^|;\s*)v2s=([a-f0-9]{64})/) || [])[1];
const setCookie = (tok) => ({ 'Set-Cookie': `v2s=${tok}; Path=/stats; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` });

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!env.STATS) return html('<h1>آمار V2Fall</h1><p>پایگاه دادهٔ آمار هنوز وصل نشده است (به توکن کلادفلر دسترسی «D1: Edit» بدهید و workflow را دوباره اجرا کنید).</p>');
  const db = env.STATS; await ensure(db);
  const hash = await getMeta(db, 'pw'), salt = await getMeta(db, 'salt');
  const token = hash ? await sha(hash + ':session') : null;
  // sign-in from the Telegram bot: /stats (admin only) gives a one-time link valid for 10 minutes
  let sess = await getMeta(db, 'sess');
  if (!sess) { sess = hex(crypto.getRandomValues(new Uint8Array(32))); await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('sess', ?1)").bind(sess).run(); sess = await getMeta(db, 'sess'); }
  const botTok = await sha(sess + ':bot');
  const k = new URL(request.url).searchParams.get('k');
  if (k && /^[a-f0-9]{48}$/.test(k) && env.CODES) {
    const ok = await env.CODES.get('st:k:' + k); await env.CODES.delete('st:k:' + k);
    if (ok) return new Response(null, { status: 303, headers: { Location: '/stats', ...setCookie(botTok) } });
  }
  const ck = cookieOf(request);
  if (ck && ck === botTok && request.method !== 'POST') return page(db, env);
  if (request.method === 'POST') {
    const f = await request.formData(), pw = String(f.get('pw') || '');
    if (!hash) {
      if (ck !== botTok) return noPw();
      if (pw.length < 8) return login(true, 'رمز باید حداقل ۸ حرف باشد');
      if (pw !== String(f.get('pw2') || '')) return login(true, 'دو رمز یکی نیستند');
      const s = hex(crypto.getRandomValues(new Uint8Array(16))), h = await pbkdf(pw, s);
      // only the first one wins, even if two people post at the same moment
      const r = await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('pw', ?1)").bind(h).run();
      if (!r.meta || !r.meta.changes) return login(false, 'رمز قبلاً گذاشته شده است');
      await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('salt', ?1)").bind(s).run();
      return new Response(null, { status: 303, headers: { Location: '/stats', ...setCookie(await sha(h + ':session')) } });
    }
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    if ((await pbkdf(pw, salt)) !== hash) return login(false, 'رمز اشتباه است');
    return new Response(null, { status: 303, headers: { Location: '/stats', ...setCookie(token) } });
  }
  if (!hash) return noPw();
  if (cookieOf(request) !== token) return login(false);
  return page(db, env);
}

// everything else we have, each part on its own so one failing source never breaks the page
async function extras(env) {
  const out = {}, kv = env.CODES, UA = { 'User-Agent': 'v2fall-stats' };
  const countKeys = async (prefix, meta) => { let n = 0, c, m = []; do { const l = await kv.list({ prefix, cursor: c }); n += l.keys.length; if (meta) m.push(...l.keys.map((k) => k.metadata || {})); c = l.list_complete ? null : l.cursor; } while (c && n < 200000); return meta ? { n, m } : n; };
  await Promise.all([
    (async () => { // Telegram bot users (+ language, new per day), problem reports, live backup codes
      const u = await countKeys('tgu:', true); out.bot = { users: u.n, en: u.m.filter((x) => x.l === 'en').length, days: {} };
      u.m.forEach((x) => { if (x.t) { const d = new Date(x.t).toISOString().slice(0, 10); out.bot.days[d] = (out.bot.days[d] || 0) + 1; } });
      out.reports = await countKeys('r:'); out.backups = await countKeys('b:');
      const bc = JSON.parse(await kv.get('tg:bc') || 'null'); if (bc) out.bc = bc;
    })().catch(() => {}),
    (async () => { // Telegram channel members
      if (!env.TELEGRAM_BOT_TOKEN) return;
      const r = await (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMemberCount?chat_id=@v2fall`)).json(); if (r.ok) out.channel = r.result;
    })().catch(() => {}),
    (async () => { // YouTube: the channel's public feed (latest videos with views and likes)
      const x = await (await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UCUvQc1HdrQsvXE3mQWWRU9w', { headers: UA })).text();
      out.yt = [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
        const e = m[1], g = (re) => (e.match(re) || [])[1] || '';
        return { title: g(/<title>([^<]*)<\/title>/).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), views: +g(/<media:statistics views="(\d+)"/) || 0, likes: +g(/<media:starRating count="(\d+)"/) || 0, at: g(/<published>([^<]*)</), id: g(/<yt:videoId>([^<]*)</) };
      });
    })().catch(() => {}),
    (async () => { // GitHub: stars and downloads of the latest release per file
      const [repo, rel] = await Promise.all(['https://api.github.com/repos/meisamodin/v2fall-updates', 'https://api.github.com/repos/meisamodin/v2fall-updates/releases/latest']
        .map((u) => fetch(u, { headers: { ...UA, Accept: 'application/vnd.github+json' } }).then((r) => r.ok ? r.json() : null)));
      out.gh = { stars: repo && repo.stargazers_count, forks: repo && repo.forks_count, rel: rel && rel.tag_name, files: rel ? rel.assets.map((a) => [a.name, a.download_count]) : [] };
    })().catch(() => {}),
    (async () => { // website visits: Cloudflare analytics of the zones (needs CF_API_TOKEN with Analytics: Read)
      if (!env.CF_API_TOKEN) return;
      const H = { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' }, since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
      out.site = {};
      for (const name of ['v2fall.com', 'multiapvps.org']) {
        const z = await (await fetch('https://api.cloudflare.com/client/v4/zones?name=' + name, { headers: H })).json();
        const tag = z && z.result && z.result[0] && z.result[0].id; if (!tag) continue;
        const q = { query: `{viewer{zones(filter:{zoneTag:"${tag}"}){httpRequests1dGroups(limit:30,filter:{date_geq:"${since}"},orderBy:[date_ASC]){dimensions{date} sum{requests pageViews bytes countryMap{clientCountryName requests}} uniq{uniques}}}}}` };
        const g = await (await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H, body: JSON.stringify(q) })).json();
        const rows = g && g.data && g.data.viewer.zones[0] && g.data.viewer.zones[0].httpRequests1dGroups;
        if (rows) out.site[name] = rows; else out.siteErr = (g && g.errors && g.errors[0] && g.errors[0].message) || 'no data';
      }
    })().catch((e) => { out.siteErr = String(e && e.message || e); }),
  ]);
  return out;
}

async function page(db, env) {
  const X = await extras(env);
  const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const from30 = day(29), today = day(0), yest = day(1);
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results || []);
  const [dlDays, acDays, tot, dlBy, acBy] = await Promise.all([
    q("SELECT day, SUM(n) n FROM counts WHERE kind='dl' AND day >= ?1 GROUP BY day", from30),
    q("SELECT day, SUM(n) n FROM counts WHERE kind='active' AND day >= ?1 GROUP BY day", from30),
    q("SELECT kind, SUM(n) n FROM counts GROUP BY kind"),
    q("SELECT platform, channel, version, country, SUM(n) n FROM counts WHERE kind='dl' AND day >= ?1 GROUP BY platform, channel, version, country", from30),
    q("SELECT platform, channel, version, country, SUM(n) n FROM counts WHERE kind='active' AND day = ?1 GROUP BY platform, channel, version, country", today),
  ]);
  let gh = null;
  try { const r = await fetch('https://api.github.com/repos/meisamodin/v2fall-updates/releases?per_page=100', { headers: { 'User-Agent': 'v2fall-stats', Accept: 'application/vnd.github+json' } }); if (r.ok) gh = (await r.json()).reduce((s, x) => s + (x.assets || []).reduce((a, b) => a + (b.download_count || 0), 0), 0); } catch (e) {}
  const days = [...Array(30)].map((_, i) => day(29 - i));
  const m = (rows) => Object.fromEntries(rows.map((r) => [r.day, r.n]));
  const dl = m(dlDays), ac = m(acDays), T = Object.fromEntries(tot.map((r) => [r.kind, r.n]));
  const sum = (o, ds) => ds.reduce((s, d) => s + (o[d] || 0), 0);
  const fa = (n) => n == null ? '—' : Number(n).toLocaleString('fa-IR');
  const bars = (o, cls) => { const mx = Math.max(1, ...days.map((d) => o[d] || 0)); return `<div class="bars ${cls}">${days.map((d) => `<div style="height:${((o[d] || 0) / mx) * 100}%" data-t="${d.slice(5)}: ${o[d] || 0}"></div>`).join('')}</div><div class="axis"><span>${days[0].slice(5)}</span><span>${days[29].slice(5)}</span></div>`; };
  const flag = (cc) => cc && cc.length === 2 && cc !== '-' ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) + ' ' : '';
  const ccName = (cc) => { try { return new Intl.DisplayNames(['fa'], { type: 'region' }).of(cc.toUpperCase()); } catch (e) { return cc.toUpperCase(); } };
  const label = { platform: { 'android-arm64': 'اندروید (arm64)', 'android-armv7': 'اندروید (armv7)', android: 'اندروید', windows: 'ویندوز', macos: 'مک', other: 'سایر', linux: 'لینوکس' }, channel: { stable: 'پایدار', beta: 'آزمایشی' } };
  const table = (rows, key, title) => {
    const g = {}; rows.forEach((r) => { const k = r[key] || '-'; g[k] = (g[k] || 0) + r.n; });
    const list = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 12), tt = list.reduce((s, x) => s + x[1], 0) || 1;
    const name = (k) => key === 'country' ? (k === '-' ? 'نامعلوم' : flag(k) + ccName(k)) : (label[key] && label[key][k]) || k;
    return `<div class="card"><h2>${title}</h2>${list.length ? `<table>${list.map(([k, n]) => `<tr><td>${esc(name(k))}<div class="meter"><i style="width:${(n / tt) * 100}%"></i></div></td><td class="n">${fa(n)}</td></tr>`).join('')}</table>` : '<div class="mut">هنوز داده‌ای نیست</div>'}</div>`;
  };
  const d7 = days.slice(-7);
  return html(`<h1>آمار V2Fall</h1><div class="mut">بدون هیچ اطلاعات شخصی: فقط شمارش روزانه. دانلود = شروع دانلود یک فایل از سرور خود V2Fall (برنامه یا سایت). کاربر فعال = نصبی که آن روز برنامه را باز کرده (از نسخهٔ 18.9.5 به بعد).</div>
  <div class="grid">
    <div class="card"><div class="mut">کل دانلودها</div><div class="big">${fa((T.dl || 0) + (gh || 0))}</div><div class="mut">سرور خودمان ${fa(T.dl || 0)} · گیت‌هاب ${fa(gh)}</div></div>
    <div class="card"><div class="mut">دانلود امروز</div><div class="big">${fa(dl[today] || 0)}</div><div class="mut">۷ روز: ${fa(sum(dl, d7))} · ۳۰ روز: ${fa(sum(dl, days))}</div></div>
    <div class="card"><div class="mut">کاربر فعال دیروز</div><div class="big">${fa(ac[yest] || 0)}</div><div class="mut">امروز تا الان: ${fa(ac[today] || 0)}</div></div>
    <div class="card"><div class="mut">میانگین فعال روزانه (۷ روز)</div><div class="big">${fa(Math.round(sum(ac, d7) / 7))}</div><div class="mut">بیشترین در ۳۰ روز: ${fa(Math.max(0, ...days.map((d) => ac[d] || 0)))}</div></div>
  </div>
  <div class="two"><div class="card"><h2>دانلود روزانه (۳۰ روز)</h2>${bars(dl, '')}</div><div class="card"><h2>کاربر فعال روزانه (۳۰ روز)</h2>${bars(ac, 'g')}</div></div>
  <h2 style="margin-top:22px">دانلودها — ۳۰ روز اخیر</h2>
  <div class="two">${table(dlBy, 'platform', 'سیستم')}${table(dlBy, 'channel', 'کانال')}${table(dlBy, 'version', 'نسخه')}${table(dlBy, 'country', 'کشور')}</div>
  <h2 style="margin-top:22px">کاربران فعال امروز</h2><div class="mut" style="margin:-6px 0 8px">کشورِ کسی که به VPN وصل است، کشور سرور VPN او ثبت می‌شود.</div>
  <div class="two">${table(acBy, 'version', 'نسخهٔ نصب‌شده')}${table(acBy, 'platform', 'سیستم')}${table(acBy, 'channel', 'کانال')}${table(acBy, 'country', 'کشور')}</div>
  ${extraHtml(X, days, fa, bars, esc)}
  <p class="mut" style="margin-top:18px">به‌روزرسانی: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>`);
}

function extraHtml(X, days, fa, bars, esc) {
  const card = (t, v, sub) => `<div class="card"><div class="mut">${t}</div><div class="big">${v}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</div>`;
  let h = '';
  // site
  const sites = X.site || {}, names = Object.keys(sites);
  h += '<h2 style="margin-top:26px">🌍 بازدید سایت</h2>';
  if (names.length) {
    const tot = {}, pv = {}, uq = {}, cc = {};
    names.forEach((n) => sites[n].forEach((r) => { const d = r.dimensions.date; tot[d] = (tot[d] || 0) + r.sum.requests; pv[d] = (pv[d] || 0) + r.sum.pageViews; uq[d] = (uq[d] || 0) + r.uniq.uniques; (r.sum.countryMap || []).forEach((c) => { cc[c.clientCountryName] = (cc[c.clientCountryName] || 0) + c.requests; }); }));
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0), last = days[29], d7 = days.slice(-7);
    h += `<div class="grid">${card('بازدیدکنندهٔ یکتا امروز', fa(uq[last] || 0), 'دیروز: ' + fa(uq[days[28]] || 0))}${card('بازدید صفحه (۷ روز)', fa(d7.reduce((s, d) => s + (pv[d] || 0), 0)), '۳۰ روز: ' + fa(sum(pv)))}${card('بازدیدکنندهٔ یکتا (۳۰ روز، جمع روزها)', fa(sum(uq)))}${card('کل درخواست‌ها (۳۰ روز)', fa(sum(tot)), 'شامل دانلود و آپدیت برنامه')}</div>`;
    const top = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 10), tt = top.reduce((s, x) => s + x[1], 0) || 1;
    h += `<div class="two"><div class="card"><h2>بازدیدکنندهٔ یکتا روزانه</h2>${bars(uq, '')}</div><div class="card"><h2>کشورها (درخواست‌ها)</h2><table>${top.map(([k, n]) => `<tr><td>${esc(k)}<div class="meter"><i style="width:${(n / tt) * 100}%"></i></div></td><td class="n">${fa(n)}</td></tr>`).join('')}</table></div></div>`;
  } else h += `<div class="card mut">آمار سایت در دسترس نیست${X.siteErr ? ' (' + esc(X.siteErr) + ')' : ''} — توکن کلادفلر باید دسترسی «Analytics: Read» داشته باشد.</div>`;
  // bot + channel
  const b = X.bot || {};
  const d7 = days.slice(-7), bd = b.days || {};
  h += '<h2 style="margin-top:26px">🤖 ربات و تلگرام</h2><div class="grid">' +
    card('کاربران ربات', fa(b.users), `فارسی ${fa((b.users || 0) - (b.en || 0))} · انگلیسی ${fa(b.en)}`) +
    card('کاربر جدید ربات (۷ روز)', fa(d7.reduce((s, d) => s + (bd[d] || 0), 0)), 'امروز: ' + fa(bd[days[29]] || 0)) +
    card('اعضای کانال @v2fall', fa(X.channel)) +
    card('گزارش مشکل (۳۰ روز)', fa(X.reports), 'کد پشتیبان فعال: ' + fa(X.backups)) + '</div>';
  if (X.bc) h += `<div class="card mut">آخرین ارسال همگانی: ${fa(X.bc.sent)} رسید · ${fa(X.bc.failed)} نرسید${X.bc.done ? '' : ' · در جریان'}</div>`;
  if (Object.keys(bd).length) h += `<div class="card" style="margin-top:10px"><h2>کاربر جدید ربات در روز</h2>${bars(bd, 'g')}</div>`;
  // youtube
  const yt = X.yt || [];
  h += '<h2 style="margin-top:26px">▶️ یوتیوب</h2>';
  if (yt.length) {
    const v = yt.reduce((s, x) => s + x.views, 0), l = yt.reduce((s, x) => s + x.likes, 0), mx = Math.max(1, ...yt.map((x) => x.views));
    h += `<div class="grid">${card('بازدید ' + fa(yt.length) + ' ویدیوی آخر', fa(v))}${card('لایک‌ها', fa(l))}${card('پربازدیدترین', fa(mx))}</div>
    <div class="card"><table>${yt.map((x) => `<tr><td><a href="https://youtu.be/${esc(x.id)}" target="_blank" rel="noopener">${esc(x.title)}</a><div class="meter"><i style="width:${(x.views / mx) * 100}%"></i></div></td><td class="n">${fa(x.views)}</td></tr>`).join('')}</table></div>`;
  } else h += '<div class="card mut">فید یوتیوب در دسترس نیست.</div>';
  // github
  const g = X.gh || {};
  h += `<h2 style="margin-top:26px">🐙 گیت‌هاب</h2><div class="grid">${card('ستاره‌ها', fa(g.stars), 'فورک: ' + fa(g.forks))}${card('دانلود آخرین ریلیز', fa((g.files || []).reduce((s, x) => s + x[1], 0)), esc(g.rel || ''))}</div>`;
  if ((g.files || []).length) { const mx = Math.max(1, ...g.files.map((x) => x[1])); h += `<div class="card"><table>${g.files.sort((a, b) => b[1] - a[1]).map(([n, c]) => `<tr><td>${esc(n)}<div class="meter"><i style="width:${(c / mx) * 100}%"></i></div></td><td class="n">${fa(c)}</td></tr>`).join('')}</table></div>`; }
  return h;
}
