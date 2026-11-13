// Telegram bot @v2fallbot (webhook: POST /tg). Telegram signs every call with a secret header derived
// from the bot token, so nobody else can drive the bot through this URL.
// - /start with coloured buttons and the V2Fall mini app (/app on this site)
// - /download /guide /dns /support; config links are never taken (privacy): the bot points to the app's own test
// - any other message → forwarded to the admin; the admin answers by replying to it
// - admin only: forward the channel post with the APK (what /download sends); /r R-XXXXXX shows a report;
//   send any message with premium emoji → the bot uses them instead of the plain ones (texts and buttons)

const SITE = 'https://v2fall.com', APP = 'https://dl.v2fall.com/app/';
// which build a file is, from its name (as the release names them)
function kindOf(fn) {
  fn = String(fn || '');
  if (!/^v2fall[-_]/i.test(fn)) return '';
  if (/-arm64\.apk$/i.test(fn)) return 'arm64'; if (/-armv7\.apk$/i.test(fn)) return 'armv7'; if (/^V2Fall-[\d.]+\.apk$/i.test(fn)) return 'apk';
  if (/\.exe$/i.test(fn)) return 'win'; if (/Apple-Silicon\.dmg$/i.test(fn)) return 'macarm'; if (/Intel\.dmg$/i.test(fn)) return 'macintel';
  if (/\.deb$/i.test(fn)) return 'deb'; if (/\.tar\.gz$/i.test(fn)) return 'tar'; return '';
}
const KIND_FA = { apk: 'اندروید (همه)', arm64: 'اندروید arm64', armv7: 'اندروید armv7', win: 'ویندوز', macarm: 'مک M', macintel: 'مک اینتل', deb: 'لینوکس deb', tar: 'لینوکس tar.gz' };
async function storeFile(kv, kind, ref) { await kv.put('tg:f:' + kind, JSON.stringify(ref)); if (kind === 'apk') await kv.put('tg:apk', JSON.stringify(ref)); }
const enc = new TextEncoder();
async function secretOf(token) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('v2fall-tg:' + token)));
  return Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

// buttons: [emoji, text, action, style]; action = callback name, 'url:…' or 'app:…' (mini app)
const MENU = [
  [['🚀', 'باز کردن V2Fall در تلگرام', 'app:', 'success']],
  [['📥', 'دریافت آخرین نسخه', 'download', 'primary']],
  [['🌍', 'Ashflake', 'ashflake', 'success']],
  [['📚', 'آموزش‌ها', 'guide', 'primary'], ['🌐', 'حالت فقط DNS', 'dns', 'primary']],
  [['🐞', 'پشتیبانی', 'support', 'danger']],
  [['🌍', 'سایت V2Fall', 'url:' + SITE], ['📢', 'کانال', 'url:https://t.me/v2fall']],
  [['🌐', 'English', 'lang']],
];
const BACK = [[['🏠', 'منوی اصلی', 'start']]];
const GUIDE_KB = [
  [['⚡', 'شروع سریع', 'url:' + SITE + '/guide/start'], ['☁️', 'وارپ رایگان', 'url:' + SITE + '/guide/warp']],
  [['🌍', 'Ashflake', 'url:' + SITE + '/guide/ashflake']],
  [['🛟', 'وصل ماندن در قطعی', 'url:' + SITE + '/guide/outage'], ['🧹', 'IP تمیز', 'url:' + SITE + '/guide/clean-ip']],
  [['🔑', 'پشتیبان با کد', 'url:' + SITE + '/guide/backup'], ['📊', 'سهمیهٔ مصرف', 'url:' + SITE + '/guide/quota']],
  [['🎮', 'کنسول بازی', 'url:' + SITE + '/guide/console'], ['🎬', 'ویدیوها', 'url:https://youtube.com/@v2fall']],
  [['🏠', 'منوی اصلی', 'start']],
];

const T = {
  start: '👋 سلام! من ربات V2Fall هستم.\n\n🛡 V2Fall فیلترشکن رایگان و سریع برای اندروید، ویندوز، مک و لینوکس است.\n\n🚀 «باز کردن V2Fall در تلگرام» همه‌چیز را یک‌جا دارد: دانلود، آموزش‌ها و پشتیبانی.\n🔒 ربات هیچ لینک یا کانفیگی از شما نمی‌گیرد.',
  guide: '📚 آموزش‌های V2Fall\n\nیکی را انتخاب کن 👇',
  dns: '🌐 حالت «فقط DNS» (نسخهٔ 18.9.17 به بعد)\n\n✅ بدون سرور و بدون مصرف حجم، DNS کل دستگاه عوض می‌شود: شکن، الکترو، ۴۰۳، بگذر، رادار گیم یا DNS دلخواه خودت.\n\n🔒 DoH و DoT هم پشتیبانی می‌شود، پس آدرس اختصاصی DNS پولی را هم می‌توانی بدهی.\n\n💡 برای سایت‌ها و بازی‌هایی خوب است که ایران را تحریم کرده‌اند؛ برای فیلترینگ، کانفیگ لازم است.',
  ashflake: '🌍 Ashflake (نسخهٔ 18.9.28 به بعد)\n\nایرانی‌های خارج از کشور با V2Fall پل می‌شوند برای کاربران داخل ایران؛ مثل دانه‌های خاکستر که با باد همه‌جا پخش می‌شوند و بستن همه‌شان ناممکن است.\n\n✈️ خارج از ایرانی؟\nابزارها ← Ashflake ← روشن\n🔒 محتوا رمزگذاری‌شده است (WebRTC)؛ فقط IP دو طرف، مثل تماس تصویری، برای اتصال دیده می‌شود\n🛡 ایمیل و اسپم، تورنت و شبکهٔ خانگی‌ات همیشه بسته است\n⚙️ سقف ۲، ۵ یا ۱۰ کاربر و سرعت ۱، ۲ یا ۵ مگابیت؛ روی گوشی فقط وای‌فای و موقع شارژ\n🔒 فقط برای خانواده؟ «فقط با کد خصوصی» را بزن و لینک یا کد را برایشان بفرست\n\n🇮🇷 داخل ایرانی؟\nافزودن ← Ashflake ← افزودن سرور، بعد وصل شو. بدون کانفیگ، از طریق داوطلب‌ها؛ اگر یکی قطع شد خودکار سراغ نفر بعدی می‌رود. کد خصوصی داری؟ همان را در «+» بچسبان.\n\n🙏 این را برای دوستان و خانوادهٔ خارج از ایرانت بفرست.',
  support: '🐞 پشتیبانی\n\n⚡ سریع‌ترین راه: در برنامه برو به ابزارها ← «گزارش مشکل». لاگ بدون آدرس سرور و لینک‌هایت مستقیم برای ما می‌آید.\n\n✍️ یا همین‌جا مشکلت را بنویس؛ پیامت به پشتیبانی می‌رسد و جوابت همین‌جا می‌آید.',
};

// English: every fixed Persian string → English (texts and button labels); users whose Telegram is not
// Persian get English, and "🌐 English / فارسی" switches it
const EN = {
  'باز کردن V2Fall در تلگرام': 'Open V2Fall in Telegram', 'دریافت آخرین نسخه': 'Get the latest version', 'تست کانفیگ': 'Test a config', 'آموزش‌ها': 'Guides',
  'حالت فقط DNS': 'DNS-only mode',  'پشتیبانی': 'Support', 'سایت V2Fall': 'V2Fall website', 'کانال': 'Channel', 'منوی اصلی': 'Main menu', 'English': 'فارسی',
  'شروع سریع': 'Quick start', 'وارپ رایگان': 'Free WARP', 'وصل ماندن در قطعی': 'Stay online in shutdowns', 'IP تمیز': 'Clean IP', 'پشتیبان با کد': 'Backup code',
  'سهمیهٔ مصرف': 'Data quota', 'کنسول بازی': 'Game consoles', 'ویدیوها': 'Videos', 'فرم پشتیبانی': 'Support form', 'دانلود از سایت': 'Download from the website', 'تست یکی دیگر': 'Test another one', 'ویندوز': 'Windows', 'مک M': 'Mac (M chip)', 'مک اینتل': 'Mac (Intel)', 'لینوکس deb': 'Linux deb', 'لینوکس tar.gz': 'Linux tar.gz',
  start: '👋 Hi! I am the V2Fall bot.\n\n🛡 V2Fall is a free, fast VPN app for Android, Windows, macOS and Linux.\n\n🚀 "Open V2Fall in Telegram" has everything in one place: downloads, guides and support.\n🔒 The bot never asks for or keeps your links or configs.',
  guide: '📚 V2Fall guides\n\nPick one 👇',
  dns: '🌐 DNS-only mode (version 18.9.17 and later)\n\n✅ No server and no data use: switches the DNS of the whole device — Shecan, Electro, 403, Begzar, Radar Game or your own.\n\n🔒 DoH and DoT are supported too, so paid DNS addresses work.\n\n💡 Good for sites and games that block Iran; for censorship you need a config.',
  ashflake: '🌍 Ashflake (version 18.9.28 and later)\n\nIranians abroad become bridges for users inside Iran with V2Fall — like flakes of ash carried everywhere by the wind, far too many to block.\n\n✈️ Outside Iran?\nTools → Ashflake → On\n🔒 Encrypted (WebRTC): nobody sees the content; as in any video call, only the two IP addresses are seen\n🛡 Mail and spam, torrents and your home network are always blocked\n⚙️ 2, 5 or 10 users and 1, 2 or 5 Mbit; on phones Wi-Fi only and only while charging\n🔒 Only for family? Choose "Only with my private code" and send them the link or code\n\n🇮🇷 In Iran?\nAdd → Ashflake → Add the server, then connect. No config needed; if a volunteer leaves, the next one takes over. Got a private code? Paste it with +.\n\n🙏 Share this with your friends and family outside Iran.',
  support: '🐞 Support\n\n⚡ Fastest: in the app open Tools → "Report a problem". The log, without your server addresses or links, comes straight to us.\n\n✍️ Or write your problem here; it reaches support and the answer comes back here.',
  '✉️ پیامت به پشتیبانی رسید؛ جواب همین‌جا می‌آید.': '✉️ Your message reached support; the answer will come here.',
};
const isEn = l => l === 'en';
const tr = (s, l) => isEn(l) ? (EN[s] || s) : s;

// premium emoji: the admin sends them once, the bot stores { '📥': custom_emoji_id, … }
let EMO = null;
async function emo(kv) { if (EMO) return EMO; try { EMO = JSON.parse(await kv.get('tg:emoji') || '{}'); } catch (e) { EMO = {}; } return EMO; }
const u16 = s => { let n = 0; for (const ch of s) n += ch.length; return n; };
// text → { text, entities } with every known emoji turned into its premium version
function deco(text, map) {
  const ents = []; let off = 0;
  for (const seg of new Intl.Segmenter('fa', { granularity: 'grapheme' }).segment(text)) {
    const g = seg.segment, id = map[g] || map[g.replace(/️/g, '')];
    if (id) ents.push({ type: 'custom_emoji', offset: off, length: g.length, custom_emoji_id: id });
    off += g.length;
  }
  return ents;
}
function kb(rows, map) {
  return { inline_keyboard: rows.map(r => r.map(([e, t, a, st]) => {
    const id = map[e] || map[e.replace(/️/g, '')];
    const b = { text: id ? t : e + ' ' + t };
    if (id) b.icon_custom_emoji_id = id;
    if (st) b.style = st;
    if (a.startsWith('url:')) b.url = a.slice(4); else if (a.startsWith('app:')) b.web_app = { url: APP + a.slice(4) }; else b.callback_data = a;
    return b;
  })) };
}

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try { return await r.json(); } catch (e) { return {}; }
}
async function say(env, chat, text, rows, lang) {
  const map = await emo(env.CODES);
  if (isEn(lang)) { text = EN[text] || text; if (rows) rows = rows.map(r => r.map(([e, t, a, st]) => [e, EN[t] || t, a.startsWith('app:') ? 'app:?lang=en' + a.slice(4) : a, st])); }
  const body = { chat_id: chat, text, entities: deco(text, map), link_preview_options: { is_disabled: true } };
  if (rows) body.reply_markup = kb(rows, map);
  let r = await tg(env, 'sendMessage', body);
  if (!r.ok) { // premium emoji or button styles not allowed → plain message
    delete body.entities; if (rows) body.reply_markup = kb(rows.map(x => x.map(([e, t, a]) => [e, t, a])), {});
    r = await tg(env, 'sendMessage', body);
  }
  return r;
}

async function download(env, chat, lang) {
  const kv = env.CODES; let m = null;
  try { m = await (await fetch('https://dl.v2fall.com/latest.json', { cf: { cacheTtl: 300 } })).json(); } catch (e) {}
  const v = m && m.version ? m.version : '';
  const f = await kv.get('tg:apk');
  if (f) { const j = JSON.parse(f); await tg(env, 'copyMessage', { chat_id: chat, from_chat_id: j.chat, message_id: j.id }); }
  const have = {}; for (const k of ['arm64', 'armv7', 'win', 'macarm', 'macintel', 'deb', 'tar']) have[k] = !!(await kv.get('tg:f:' + k));
  const en = isEn(lang), nt = m && (en ? m.notes_en || m.notes : m.notes);
  const notes = nt ? (en ? '\n\n✨ What is new:\n' : '\n\n✨ تازه‌ها:\n') + String(nt).split('\n').slice(0, 5).join('\n') : '';
  await say(env, chat, `📥 V2Fall ${v}` + (en ? (f ? '\n📱 Install the Android file above.' : '') + '\n\n💻 Every version (Android, Windows, macOS, Linux) on the website and in the mini app.\n📢 If the website does not open: the @v2fall channel'
    : (f ? '\n📱 فایل اندروید بالا را نصب کن.' : '') + '\n\n💻 همهٔ نسخه‌ها (اندروید، ویندوز، مک، لینوکس) در سایت و مینی‌اپ.\n📢 اگر سایت باز نشد: کانال @v2fall') + notes,
    [...[[['📱', 'arm64', 'f:arm64'], ['📱', 'armv7', 'f:armv7']], [['🪟', 'ویندوز', 'f:win', 'primary']], [['🍎', 'مک M', 'f:macarm'], ['🍎', 'مک اینتل', 'f:macintel']], [['🐧', 'لینوکس deb', 'f:deb'], ['🐧', 'لینوکس tar.gz', 'f:tar']]]
      .map(r => r.filter(b => have[b[2].slice(2)])).filter(r => r.length),
     [['🚀', 'باز کردن V2Fall در تلگرام', 'app:#download', 'success']], ...BACK], lang);
}

const FLOOD = new Map();
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (!env.TELEGRAM_BOT_TOKEN) return new Response('off', { status: 503 });
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await secretOf(env.TELEGRAM_BOT_TOKEN)) return new Response('no', { status: 403 });
  let u; try { u = await request.json(); } catch (e) { return new Response('ok'); }
  const admin = String(env.TELEGRAM_ADMIN_ID || ''), kv = env.CODES;
  const from = (u.message && u.message.from) || (u.callback_query && u.callback_query.from) || {};
  const pref = from.id ? await kv.get('tgl:' + from.id) : null;
  const lang = pref || 'fa';
  const menu = async chat => {
    if (from.id && !(await kv.get('tgu:' + from.id))) await kv.put('tgu:' + from.id, lang, { metadata: { l: lang, t: Date.now() } });
    return say(env, chat, isEn(lang) ? 'start' : T.start, MENU, lang);
  };
  const sayT = (chat, k, rows) => say(env, chat, isEn(lang) ? k : T[k], rows, lang);
  try {
    // new file in the store channel (only the channel the admin chose): the universal APK becomes what /download sends
    if (u.channel_post) {
      const p = u.channel_post, store = await kv.get('tg:store');
      const fn = p.document && p.document.file_name || '';
      const k = kindOf(fn);
      if (store && String(p.chat.id) === store && k) {
        await storeFile(kv, k, { chat: p.chat.id, id: p.message_id });
        if (admin) await say(env, admin, `✅ ${fn} (${KIND_FA[k]}) در انبار ثبت شد.`);
      }
      return new Response('ok');
    }
    if (u.callback_query) {
      const c = u.callback_query, chat = c.message && c.message.chat.id;
      await tg(env, 'answerCallbackQuery', { callback_query_id: c.id });
      if (c.data === 'download') await download(env, chat, lang);
      else if (c.data.startsWith('f:')) { const f = await kv.get('tg:f:' + c.data.slice(2)); if (f) { const j = JSON.parse(f); await tg(env, 'copyMessage', { chat_id: chat, from_chat_id: j.chat, message_id: j.id }); } }
      else if (c.data === 'start') await menu(chat);
      else if (c.data === 'lang') { const nl = isEn(lang) ? 'fa' : 'en'; await kv.put('tgl:' + from.id, nl); { const o = await kv.getWithMetadata('tgu:' + from.id); await kv.put('tgu:' + from.id, nl, { metadata: { l: nl, t: (o && o.metadata && o.metadata.t) || Date.now() } }); } await say(env, chat, isEn(nl) ? 'start' : T.start, MENU, nl); }
      else if (c.data === 'guide') await sayT(chat, 'guide', GUIDE_KB);
      else if (T[c.data]) await sayT(chat, c.data, c.data === 'support' ? [[['🚀', 'فرم پشتیبانی', 'app:#support', 'danger']], ...BACK] : BACK);
      return new Response('ok');
    }
    const m = u.message; if (!m || !m.chat || m.chat.type !== 'private') return new Response('ok');
    const chat = m.chat.id, text = String(m.text || m.caption || '').trim(), isAdmin = admin && String(chat) === admin;
    const now = Date.now(), fl = FLOOD.get(chat) || { t: now, n: 0 }; if (now - fl.t > 60000) { fl.t = now; fl.n = 0; } fl.n++; FLOOD.set(chat, fl);
    if (fl.n > 30) return new Response('ok');

    if (/^\/myid\b/.test(text)) { await say(env, chat, (isEn(lang) ? '🆔 Your numeric ID: ' : '🆔 آیدی عددی شما: ') + chat); return new Response('ok'); }
    if (isAdmin) {
      // a file forwarded from a channel: that channel becomes the file store, and this file is what /download sends
      const fo = m.forward_origin && m.forward_origin.type === 'channel' ? { chat: m.forward_origin.chat.id, id: m.forward_origin.message_id } : m.forward_from_chat ? { chat: m.forward_from_chat.id, id: m.forward_from_message_id } : null;
      if (fo && m.document) {
        const k = kindOf(m.document.file_name);
        if (!k) { await say(env, chat, '❓ اسم این فایل شبیه فایل‌های V2Fall نیست؛ ذخیره نشد.'); return new Response('ok'); }
        await storeFile(kv, k, fo); await kv.put('tg:store', String(fo.chat));
        await say(env, chat, `✅ ${KIND_FA[k]} ذخیره شد؛ کاربران از ربات و مینی‌اپ همین را می‌گیرند.\n\n📦 این کانال انبار فایل‌ها شد: از این به بعد هر فایل جدیدی که در آن آپلود کنی، ربات خودش برمی‌دارد.`); return new Response('ok');
      }
      // a premium emoji pack link (t.me/addemoji/NAME): take every emoji of the pack at once
      const pk = text.match(/t\.me\/addemoji\/([A-Za-z0-9_]+)/);
      if (pk) {
        const r = await tg(env, 'getStickerSet', { name: pk[1] });
        if (!r.ok || !r.result) { await say(env, chat, '❌ این پک پیدا نشد.'); return new Response('ok'); }
        const map = await emo(kv); let n = 0;
        for (const st of r.result.stickers || []) if (st.custom_emoji_id && st.emoji) { const k = st.emoji.replace(/\uFE0F/g, ''); if (!map['__set:' + k]) { map[st.emoji] = st.custom_emoji_id; map[k] = st.custom_emoji_id; map['__set:' + k] = 1; n++; } }
        for (const k of Object.keys(map)) if (k.startsWith('__set:')) delete map[k];
        await kv.put('tg:emoji', JSON.stringify(map)); EMO = map;
        await say(env, chat, `✅ ${n} ایموجی پرمیوم از پک «${r.result.title}» ذخیره شد. /start را بزن و ببین.`, BACK); return new Response('ok');
      }
      if (/^\/emoji_reset\b/.test(text)) { await kv.put('tg:emoji', '{}'); EMO = {}; await say(env, chat, '✅ ایموجی‌ها به حالت عادی برگشت.'); return new Response('ok'); }
      const ce = (m.entities || []).filter(e => e.type === 'custom_emoji');
      if (ce.length && !m.reply_to_message) {
        const map = await emo(kv), src = String(m.text || '');
        for (const e of ce) { const ch = src.substr(e.offset, e.length); map[ch] = e.custom_emoji_id; map[ch.replace(/️/g, '')] = e.custom_emoji_id; }
        await kv.put('tg:emoji', JSON.stringify(map)); EMO = map;
        await say(env, chat, `✅ ${ce.length} ایموجی پرمیوم ذخیره شد. از این به بعد ربات از این‌ها استفاده می‌کند.`, BACK); return new Response('ok');
      }
      // /broadcast as a reply to any message → that message goes to everyone who started the bot
      if (/^\/broadcast\b/.test(text)) {
        if (!m.reply_to_message) { await say(env, chat, '📣 روی پیامی که می‌خواهی برای همه برود «ریپلای» بزن و بنویس /broadcast'); return new Response('ok'); }
        const job = JSON.parse(await kv.get('tg:bc') || 'null');
        if (job && !job.done && Date.now() - job.t < 3600e3) { await say(env, chat, `⏳ یک ارسال همگانی در جریان است (${job.sent} فرستاده شد).`); return new Response('ok'); }
        await kv.put('tg:bc', JSON.stringify({ from: chat, msg: m.reply_to_message.message_id, cursor: '', sent: 0, failed: 0, t: Date.now() }));
        await say(env, chat, '📣 ارسال همگانی شروع شد؛ آخرش گزارش می‌دهم.');
        ctx.waitUntil(fetch(new URL('/tgbc', request.url), { method: 'POST', headers: { 'X-Bc': await secretOf(env.TELEGRAM_BOT_TOKEN) } }));
        return new Response('ok');
      }
      if (/^\/stats\b/.test(text)) {
        const k = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
        await kv.put('st:k:' + k, '1', { expirationTtl: 600 });
        await say(env, chat, '📊 لینک ورود به صفحهٔ آمار (یک‌بارمصرف، ۱۰ دقیقه اعتبار؛ برای کسی نفرستید):', [[['📊', 'باز کردن آمار', 'url:https://dl.v2fall.com/stats?k=' + k, 'primary']]]); return new Response('ok');
      }
      if (/^\/users\b/.test(text)) { let n = 0, c; do { const l = await kv.list({ prefix: 'tgu:', cursor: c }); n += l.keys.length; c = l.list_complete ? null : l.cursor; } while (c); await say(env, chat, `👥 ${n} نفر ربات را Start کرده‌اند.`); return new Response('ok'); }
      const rm = text.match(/^\/r\s+R?-?([A-Z0-9]{6})/i);
      if (rm) { const r = await kv.get('r:' + rm[1].toUpperCase()); await say(env, chat, r ? JSON.stringify(JSON.parse(r), null, 1).slice(0, 4000) : 'پیدا نشد'); return new Response('ok'); }
      const rq = m.reply_to_message, rt = rq && ((String(rq.text || rq.caption || '').match(/#u(\d+)/) || [])[1] || await kv.get('tg:fw:' + rq.message_id));
      if (rt) { await tg(env, 'copyMessage', { chat_id: +rt, from_chat_id: chat, message_id: m.message_id }); await say(env, chat, '✅ فرستاده شد'); return new Response('ok'); }
      if (/^\/emoji\b/.test(text)) { await say(env, chat, '✨ دو راه:\n\n۱) لینک یک پک ایموجی پرمیوم را بفرست (مثل t.me/addemoji/…) — همهٔ ایموجی‌هایش یک‌جا ذخیره می‌شود.\n\n۲) یا یک پیام با ایموجی‌های پرمیوم بفرست، هر کدام جای یکی از این‌ها:\n👋 🛡 🚀 📥 🩺 📚 🌐 🐞 🌍 📢 🔎 ⚠️ ✅ ❌ 💡 🔒 ⚡ ✍️ 📱 💻 ✨ 🏠 ☁️ 🛟 🧹 🔑 📊 🎮 🎬 🆔 🔗 ✉️ ℹ️'); return new Response('ok'); }
    }
    const cmd = (text.match(/^\/([a-z]+)/i) || [])[1];
    if (cmd === 'start' || cmd === 'help') { await menu(chat); return new Response('ok'); }
    if (cmd === 'download') { await download(env, chat, lang); return new Response('ok'); }
    if (cmd === 'guide') { await sayT(chat, 'guide', GUIDE_KB); return new Response('ok'); }
    if (cmd && T[cmd]) { await sayT(chat, cmd, BACK); return new Response('ok'); }
    // config links are not taken, stored or forwarded — for privacy; the app tests them on the user's own internet
    if (/\b(vless|vmess|trojan|ss|ssr|hy2|hysteria2?|tuic|wireguard|wg|socks|anytls|mdv|dnstt):\/\/\S+/i.test(text) || /\/(sub|api\/sub)\//i.test(text)) {
      await say(env, chat, isEn(lang) ? '🔒 For your privacy the bot does not take config or subscription links (and did not keep this one). To test a config, use "Ping test" in the V2Fall app — it checks it on your own internet.'
        : '🔒 برای حفظ حریم خصوصی، ربات لینک کانفیگ یا اشتراک نمی‌گیرد (این یکی هم ذخیره یا فرستاده نشد). برای تست کانفیگ، در برنامهٔ V2Fall «تست پینگ» بزن؛ روی اینترنت خودت تستش می‌کند.', BACK, lang);
      return new Response('ok');
    }
    if (cmd) { await menu(chat); return new Response('ok'); }
    if (admin && !isAdmin) {
      const who = [m.from && m.from.first_name, m.from && m.from.username ? '@' + m.from.username : ''].filter(Boolean).join(' ');
      // support without storing anything: the message goes to the admin with the user's id in it (#u123);
      // the admin's reply to that message is sent back to that id
      const tag = `👤 ${who || 'کاربر'} #u${chat}`;
      if (m.text) await tg(env, 'sendMessage', { chat_id: admin, text: `${tag}\n\n${m.text}`.slice(0, 4096) });
      else await tg(env, 'copyMessage', { chat_id: admin, from_chat_id: chat, message_id: m.message_id, caption: `${tag}${m.caption ? '\n\n' + m.caption : ''}`.slice(0, 1024) });
      await say(env, chat, '✉️ پیامت به پشتیبانی رسید؛ جواب همین‌جا می‌آید.', BACK, lang);
    } else if (!isAdmin) await menu(chat);
  } catch (e) {}
  return new Response('ok');
}
export const onRequestGet = () => new Response('V2Fall bot');
