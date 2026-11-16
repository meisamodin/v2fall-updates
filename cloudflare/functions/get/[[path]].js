// One direct download for each release file: /get/<file name> (or /get/<manifest key>, e.g. /get/android_arm64),
// /get/experimental/<…> for the experimental channel.
// Pages keeps files under 25 MB, so every release file is stored as parts (download/parts/<name>.p00, .p01 …).
// This joins them back into one response: a normal browser download from the own domain — real file name and
// size, a progress bar, and resuming (Range) after a dropped connection — instead of GitHub, or the old "mirror"
// button that stitched the parts together in the page's memory.
import { bump, fileInfo } from '../../lib/stats.js';

const TYPES = [[/\.apk$/i, 'application/vnd.android.package-archive'], [/\.exe$/i, 'application/vnd.microsoft.portable-executable'],
  [/\.dmg$/i, 'application/x-apple-diskimage'], [/\.deb$/i, 'application/vnd.debian.binary-package'], [/\.(tar\.gz|tgz)$/i, 'application/gzip'],
  [/\.zip$/i, 'application/zip'], [/\.xpi$/i, 'application/x-xpinstall']];
const PART = 19922944; // the size release files are split at (tools/publish_all.py)
const typeOf = n => (TYPES.find(([re]) => re.test(n)) || [0, 'application/octet-stream'])[1];
const base = u => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); } catch (e) { return ''; } };
const plain = (status, text) => new Response(text + '\n', { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

// the manifest entry for a name: its key, its file name, or the name its parts carry
export function findFile(man, name) {
  for (const [k, v] of Object.entries(man || {})) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.parts) || !v.parts.length) continue;
    const partBase = base(v.parts[0]).replace(/\.p\d+$/, '');
    if (k === name || base(v.url || '') === name || partBase === name) return { key: k, name: partBase || base(v.url || '') || name, parts: v.parts, sha256: v.sha256, size: +v.size || 0 };
  }
  return null;
}

// "bytes=a-b" / "bytes=a-" / "bytes=-n" → [start, end] inside [0, size), null = whole file, false = cannot satisfy
export function parseRange(h, size) {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h).trim()); if (!m || (m[1] === '' && m[2] === '')) return null; // several ranges: whole file
  let a, b;
  if (m[1] === '') { const n = +m[2]; if (!n) return false; a = Math.max(0, size - n); b = size - 1; }
  else { a = +m[1]; b = m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); }
  return a < size && a <= b ? [a, b] : false;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'GET or HEAD');
  const segs = (Array.isArray(params.path) ? params.path : [params.path || '']).map(String).filter(Boolean);
  const exp = segs[0] === 'experimental'; if (exp) segs.shift();
  const name = segs.join('/');
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name)) return plain(400, 'file name?');
  const origin = new URL(request.url).origin;
  const asset = (path, init) => env.ASSETS.fetch(new Request(origin + path, init));
  // the manifest of this site (its parts already point at this domain)
  let man = null;
  try { const r = await asset((exp ? '/experimental' : '') + '/latest.json'); if (r.ok) man = await r.json(); } catch (e) {}
  const f = findFile(man, name);
  if (!f) return plain(404, 'not in the current release: ' + name);
  // a part that is on this site is read from it; one that is not (a mirror URL) is fetched from there
  const open = (u, init) => { let p = ''; try { const x = new URL(u); if (x.origin === origin || /\/download\/parts\/|\/experimental\/parts\//.test(x.pathname) && /(^|\.)(v2fall\.com|multiapvps\.org)$/.test(x.hostname)) p = x.pathname; } catch (e) {} return p ? asset(p, init) : fetch(u, init); };
  // sizes first, so the response can carry the real total size: HEAD, else the length of a GET, else the total of
  // a one-byte range; what each part answered is kept for the error text
  const seen = [];
  const sizes = await Promise.all(f.parts.map(async (u, i) => {
    const note = x => { seen[i] = (seen[i] || '') + x + ' '; };
    try { const r = await open(u, { method: 'HEAD' }); note('head ' + r.status + ':' + (r.headers.get('content-length') || '-')); const n = +r.headers.get('content-length'); if (r.ok && n > 0) return n; } catch (e) { note('head ' + e.message); }
    try { const r = await open(u); const n = +r.headers.get('content-length'); note('get ' + r.status + ':' + (r.headers.get('content-length') || '-')); try { await r.body?.cancel(); } catch (e) {} if (r.ok && n > 0) return n; } catch (e) { note('get ' + e.message); }
    try { const r = await open(u, { headers: { range: 'bytes=0-0' } }); const t = +((r.headers.get('content-range') || '').split('/')[1] || 0); note('range ' + r.status + ':' + (r.headers.get('content-range') || '-')); try { await r.body?.cancel(); } catch (e) {} return t > 0 ? t : 0; } catch (e) { note('range ' + e.message); return 0; }
  }));
  // the store did not say (Pages assets give no length here): parts are cut at a fixed size (tools/publish_all.py,
  // split -b 19922944), so the manifest's total size gives every part's size
  if (sizes.some(n => !n) && f.size > 0) {
    const last = f.size - PART * (f.parts.length - 1);
    if (last > 0 && last <= PART) f.parts.forEach((u, i) => { if (!sizes[i]) sizes[i] = i < f.parts.length - 1 ? PART : last; });
  }
  if (sizes.some(n => !n)) return plain(503, 'a part of this file cannot be read right now — try the second link. ' + seen.map((x, i) => 'p' + i + ': ' + x).join('| ').slice(0, 600));
  const size = sizes.reduce((a, b) => a + b, 0);
  const rg = parseRange(request.headers.get('range'), size);
  if (rg === false) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' } });
  const [a, b] = rg || [0, size - 1], len = b - a + 1;
  const headers = {
    'content-type': typeOf(f.name), 'content-length': String(len), 'accept-ranges': 'bytes',
    'content-disposition': `attachment; filename="${f.name}"`, 'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length, content-range, content-disposition',
    'x-content-type-options': 'nosniff',
  };
  if (f.sha256) headers.etag = '"' + f.sha256 + '"';
  if (rg) headers['content-range'] = `bytes ${a}-${b}/${size}`;
  if (request.method === 'HEAD') return new Response(null, { status: rg ? 206 : 200, headers });
  // one download = the file asked from its first byte
  if (a === 0) { const fi = fileInfo(f.name); ctx.waitUntil(bump(env, request, 'dl', fi.platform, exp ? 'experimental' : 'stable', fi.version)); }
  // the parts that cover [a, b], each asked only for its own slice
  const plan = []; let off = 0;
  f.parts.forEach((u, i) => { const s = off, e = off + sizes[i] - 1; off += sizes[i]; if (e < a || s > b) return; plan.push({ u, from: Math.max(a, s) - s, to: Math.min(b, e) - s, whole: s >= a && e <= b }); });
  const FLS = typeof FixedLengthStream === 'function' ? FixedLengthStream : null; // Workers: keeps Content-Length on a streamed body
  const { readable, writable } = FLS ? new FLS(len) : new TransformStream();
  ctx.waitUntil((async () => {
    try {
      for (const p of plan) {
        const r = await open(p.u, p.whole ? {} : { headers: { range: `bytes=${p.from}-${p.to}` } });
        if (!r.ok || !r.body) throw new Error('part ' + r.status);
        const want = p.to - p.from + 1;
        if (r.status === 206 || p.whole) await r.body.pipeTo(writable, { preventClose: true });
        else await skipTake(r.body, p.from, want, writable); // the store answered with the whole part: cut it here
      }
      await writable.close();
    } catch (e) { try { await writable.abort(e); } catch (x) {} }
  })());
  return new Response(readable, { status: rg ? 206 : 200, headers });
}

// copy `want` bytes after skipping `skip` bytes of a stream
async function skipTake(body, skip, want, writable) {
  const rd = body.getReader(), w = writable.getWriter();
  try {
    while (want > 0) {
      const { done, value } = await rd.read(); if (done) break;
      let v = value;
      if (skip > 0) { if (v.length <= skip) { skip -= v.length; continue; } v = v.subarray(skip); skip = 0; }
      if (v.length > want) v = v.subarray(0, want);
      await w.write(v); want -= v.length;
    }
    try { await rd.cancel(); } catch (e) {}
  } finally { w.releaseLock(); }
}
