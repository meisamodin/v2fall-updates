// «نظر کاربرها»: only real messages that their writers sent for this purpose, from the bot's «✍️ نظر بده».
// The writer agrees (the button's own text says so) that it is shown without their name or id; the admin reads
// each one first. Nothing about the writer is kept with an approved review: no id, no name, no username.
//   KV CODES:  rv:p:<id> = pending {text, l, t, chat}  (7 days)   rv:list = approved [{id, text, l, t}] (newest first, 200 max)
export async function rvList(kv) { try { return JSON.parse(await kv.get('rv:list') || '[]'); } catch (e) { return []; } }
export async function rvSave(kv, list) { await kv.put('rv:list', JSON.stringify(list.slice(0, 200))); }
export const rvClean = s => String(s || '').replace(/https?:\/\/\S+|t\.me\/\S+|@[A-Za-z0-9_]{4,}|\+?\d[\d\s-]{8,}\d/g, '…').replace(/\s+\n/g, '\n').trim().slice(0, 500);
