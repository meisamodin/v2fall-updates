// Abuse guard for the backup codes (shared by /b and /b/<id>):
// - wrong codes per IP: 30 an hour, then that IP is blocked for an hour
// - 100 wrong codes a day from one IP: blocked for 24 hours
// - more than 3000 wrong codes an hour from everyone together: lookups pause for 15 minutes
// - new backups per IP: 10 an hour
// Limits are generous because many people in Iran share one IP (mobile networks, VPN servers).
export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Del' };
const H = 3600, D = 86400;
export const ipOf = (request) => request.headers.get('CF-Connecting-IP') || 'x';
const num = async (kv, k) => +(await kv.get(k)) || 0;

export async function blocked(kv, ip) {
  if (await kv.get('ban:' + ip) !== null) return true;
  return (await num(kv, 'rl:bg')) > 3000;
}

export async function miss(kv, ip) {
  const h = (await num(kv, 'rl:bh:' + ip)) + 1, d = (await num(kv, 'rl:bd:' + ip)) + 1, g = (await num(kv, 'rl:bg')) + 1;
  await kv.put('rl:bh:' + ip, String(h), { expirationTtl: H });
  await kv.put('rl:bd:' + ip, String(d), { expirationTtl: D });
  await kv.put('rl:bg', String(g), { expirationTtl: g > 3000 ? 900 : H });
  if (d >= 100) await kv.put('ban:' + ip, 'day', { expirationTtl: D });
  else if (h >= 30) await kv.put('ban:' + ip, 'hour', { expirationTtl: H });
}

export async function canStore(kv, ip) {
  const n = (await num(kv, 'rl:bp:' + ip)) + 1;
  await kv.put('rl:bp:' + ip, String(n), { expirationTtl: H });
  return n <= 10;
}
