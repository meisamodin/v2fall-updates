// Anonymous counters for V2Fall in a Cloudflare D1 database (binding STATS).
// Only aggregate numbers are kept: day, what, platform, channel, version, country → count.
// No IP, no device ID, nothing per person.
let ready = false;
export async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS counts (day TEXT, kind TEXT, platform TEXT, channel TEXT, version TEXT, country TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, platform, channel, version, country))'),
    db.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)'),
  ]);
  ready = true;
}
const clean = (s, max = 24) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, max) || '-';
export async function bump(env, request, kind, platform, channel, version) {
  if (!env.STATS) return;
  const db = env.STATS;
  try {
    await ensure(db);
    const day = new Date().toISOString().slice(0, 10);
    const cc = clean((request.cf && request.cf.country) || '', 2);
    await db.prepare('INSERT INTO counts (day, kind, platform, channel, version, country, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1) ON CONFLICT (day, kind, platform, channel, version, country) DO UPDATE SET n = n + 1')
      .bind(day, clean(kind, 10), clean(platform), clean(channel, 10), clean(version, 16), cc).run();
  } catch (e) { /* counting must never break a download */ }
}
// V2Fall-18.9.4-arm64.apk.p00 / V2Fall-18.9rc32-armv7.apk / V2Fall-Setup-18.9.4.exe.p01 / V2Fall-18.9.4-macos.dmg
export function fileInfo(name) {
  const n = String(name || '');
  const part = n.match(/\.p(\d+)$/);
  const base = n.replace(/\.p\d+$/, '');
  const platform = /\.exe$/i.test(base) ? 'windows' : /\.(dmg|pkg)$/i.test(base) || /mac/i.test(base) ? 'macos' : /arm64/i.test(base) ? 'android-arm64' : /armv7/i.test(base) ? 'android-armv7' : /\.apk$/i.test(base) ? 'android' : 'other';
  const v = (base.match(/(\d+\.\d+(?:\.\d+|rc\d+)?(?:rc\d+)?)/) || [])[1] || '-';
  return { part: part ? +part[1] : -1, platform, version: v };
}
// one download = the first part fetched from the start (not a resumed / ranged request)
export async function countPart(ctx, channel) {
  const { request, env, params } = ctx;
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const f = fileInfo(path.split('/').pop());
  const range = request.headers.get('range') || '';
  const res = await env.ASSETS.fetch(request);
  if (request.method === 'GET' && res.ok && f.part === 0 && (!range || /^bytes=0-/.test(range))) ctx.waitUntil(bump(env, request, 'dl', f.platform, channel, f.version));
  return res;
}
