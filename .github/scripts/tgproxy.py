#!/usr/bin/env python3
"""Collect public Telegram MTProto proxies for V2Fall.

Reads public channel previews (t.me/s/<channel>) and a few public lists, keeps only
MTProto proxy links (no V2Ray configs, no channel names or post text = no ads),
TCP-checks every proxy and writes tg/mtproto.json, fastest first.
"""
import asyncio, html, json, re, sys, time, urllib.parse, urllib.request

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
LINK = re.compile(r'(?:tg://|https?://(?:t|telegram)\.me/)proxy\?[^\s"\'<>]+', re.I)
HOST = re.compile(r'^[A-Za-z0-9.-]{1,253}$|^\[?[0-9A-Fa-f:]{2,45}\]?$')
SECRET = re.compile(r'^(?:[0-9A-Fa-f]{32,}|[A-Za-z0-9_=+/-]{22,})$')
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}


def get(url, timeout=25):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
            return r.read(4_000_000).decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! {url}: {e}")
        return ""


def parse(link):
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(html.unescape(link)).query)
    s = (q.get("server") or [""])[0].strip()
    p = (q.get("port") or [""])[0].strip()
    k = (q.get("secret") or [""])[0].strip()
    if not (HOST.match(s) and p.isdigit() and 0 < int(p) < 65536 and SECRET.match(k)):
        return None
    if s.startswith(("127.", "10.", "192.168.", "0.")) or s == "localhost":
        return None
    return (s.lower(), int(p), k)


def lines(path):
    try:
        return [l.split("#")[0].strip() for l in open(path, encoding="utf-8") if l.split("#")[0].strip()]
    except FileNotFoundError:
        return []


async def probe(sem, px):
    async with sem:
        t = time.monotonic()
        try:
            _, w = await asyncio.wait_for(asyncio.open_connection(px[0].strip("[]"), px[1]), 4)
            w.close()
            return px, int((time.monotonic() - t) * 1000)
        except Exception:
            return px, None


async def main():
    found = {}
    for ch in lines(f"{ROOT}/tg/channels.txt"):
        ch = ch.lstrip("@")
        n0 = len(found)
        url = f"https://t.me/s/{urllib.parse.quote(ch)}"
        for _ in range(3):  # newest posts + two older pages
            page = get(url)
            for m in LINK.findall(page):
                px = parse(m)
                if px:
                    found.setdefault(px[:2], px)
            older = re.findall(r'data-before="(\d+)"', page) or re.findall(r'\?before=(\d+)', page)
            if not older:
                break
            url = f"https://t.me/s/{urllib.parse.quote(ch)}?before={older[0]}"
        print(f"channel {ch}: +{len(found) - n0}")
    for src in lines(f"{ROOT}/tg/lists.txt"):
        n0 = len(found)
        for m in LINK.findall(get(src)):
            px = parse(m)
            if px:
                found.setdefault(px[:2], px)
        print(f"list {src}: +{len(found) - n0}")
    print(f"unique: {len(found)}")
    sem = asyncio.Semaphore(100)
    res = await asyncio.gather(*(probe(sem, px) for px in found.values()))
    ok = sorted([(ms, px) for px, ms in res if ms is not None])[:200]
    print(f"reachable: {len(ok)}")
    if not ok:
        sys.exit("no reachable proxies — keeping the previous list")
    import os
    os.makedirs(f"{OUT}/tg", exist_ok=True)
    data = {"updated": int(time.time()), "count": len(ok),
            "proxies": [{"s": px[0], "p": px[1], "k": px[2]} for ms, px in ok]}
    with open(f"{OUT}/tg/mtproto.json", "w") as f:
        json.dump(data, f, separators=(",", ":"))


asyncio.run(main())
