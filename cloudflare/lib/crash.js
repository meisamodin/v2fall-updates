// shared by functions/crash.js (reports in) and functions/stats.js (admin page)
// anything that could point at a person or a server goes: links, addresses, IPs, uuids, emails, long tokens
export function scrub(t, max) {
  return String(t || '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>)]+/gi, '<link>')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/g, '<ip>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|ir|io|xyz|me|info|top|site|online|cloud|dev|app|link|live|pro|shop|store|club)\b/gi, '<host>')
    .replace(/[A-Za-z0-9_\-+/=]{32,}/g, '<x>')
    .slice(0, max);
}
let ready = false;
export async function crashInit(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS crash (h TEXT PRIMARY KEY, v TEXT, p TEXT, k TEXT, m TEXT, s TEXT, n INTEGER NOT NULL DEFAULT 0, first INTEGER, last INTEGER)').run();
  ready = true;
}
// for the admin stats page
export async function crashList(db, days = 7) {
  try { await crashInit(db); } catch (e) { return []; }
  const r = await db.prepare('SELECT h, v, p, k, m, s, n, first, last FROM crash WHERE last > ? ORDER BY n DESC LIMIT 25').bind(Date.now() - days * 864e5).all();
  return r.results || [];
}
