#!/usr/bin/env python3
"""Collect public SOCKS5 / SOCKS4 / HTTP proxies for V2Fall.

Reads a few public lists, then checks every proxy for real: a full proxy handshake and an HTTP
request through it (not just an open port). Writes px/proxies.json, fastest first. The app tests
them again from the user's own network before showing any.
"""
import asyncio, json, os, random, re, sys, time, urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
SOURCES = {
    "socks5": [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
        "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt",
        "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
    ],
    "socks4": [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
        "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt",
    ],
    "http": [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
        "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
    ],
}
HP = re.compile(r"(?:^|//|@)(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\b", re.M)
TEST_HOST, TEST_PATH = "cp.cloudflare.com", "/generate_204"
PER_TYPE = 2500  # candidates checked per type (random sample when a list is bigger)


def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "v2fall-collector"}), timeout=30) as r:
            return r.read(8_000_000).decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! {url}: {e}")
        return ""


def public(ip):
    a, b = (int(x) for x in ip.split(".")[:2])
    return not (a in (0, 10, 127) or a >= 224 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168) or (a == 169 and b == 254) or (a == 100 and 64 <= b <= 127))


async def check(kind, ip, port, sem):
    async with sem:
        t = time.monotonic()
        try:
            r, w = await asyncio.wait_for(asyncio.open_connection(ip, port), 4)
        except Exception:
            return None
        try:
            async def io():
                if kind == "socks5":
                    w.write(b"\x05\x01\x00"); await w.drain()
                    if (await r.readexactly(2)) != b"\x05\x00":
                        return False
                    h = TEST_HOST.encode()
                    w.write(b"\x05\x01\x00\x03" + bytes([len(h)]) + h + (80).to_bytes(2, "big")); await w.drain()
                    rep = await r.readexactly(4)
                    if rep[1] != 0:
                        return False
                    n = {1: 4, 4: 16}.get(rep[3])
                    await r.readexactly((n if n else (await r.readexactly(1))[0]) + 2)
                elif kind == "socks4":
                    # SOCKS4a: domain after the user id
                    w.write(b"\x04\x01" + (80).to_bytes(2, "big") + b"\x00\x00\x00\x01" + b"\x00" + TEST_HOST.encode() + b"\x00"); await w.drain()
                    rep = await r.readexactly(8)
                    if rep[1] != 0x5A:
                        return False
                req = (f"GET http://{TEST_HOST}{TEST_PATH} HTTP/1.1\r\n" if kind == "http" else f"GET {TEST_PATH} HTTP/1.1\r\n") + f"Host: {TEST_HOST}\r\nConnection: close\r\n\r\n"
                w.write(req.encode()); await w.drain()
                line = await r.readline()
                return line.startswith(b"HTTP/1.") and b" 204" in line
            ok = await asyncio.wait_for(io(), 8)
            return int((time.monotonic() - t) * 1000) if ok else None
        except Exception:
            return None
        finally:
            w.close()


async def main():
    sem = asyncio.Semaphore(400)
    results = []
    for kind, urls in SOURCES.items():
        found = set()
        for u in urls:
            n0 = len(found)
            for ip, port in HP.findall(get(u)):
                if all(0 <= int(x) <= 255 for x in ip.split(".")) and public(ip) and 0 < int(port) < 65536:
                    found.add((ip, int(port)))
            print(f"{kind} {u.split('/')[3]}: +{len(found) - n0}")
        cand = random.sample(sorted(found), min(PER_TYPE, len(found)))
        res = await asyncio.gather(*(check(kind, ip, port, sem) for ip, port in cand))
        ok = [(ms, kind, ip, port) for (ip, port), ms in zip(cand, res) if ms is not None]
        print(f"{kind}: {len(found)} unique, {len(cand)} checked, {len(ok)} working")
        results += ok
    results.sort()
    if not results:
        sys.exit("no working proxies")
    os.makedirs(f"{OUT}/px", exist_ok=True)
    data = {"updated": int(time.time()), "count": min(len(results), 400),
            "proxies": [{"t": k, "s": ip, "p": port, "ms": ms} for ms, k, ip, port in results[:400]]}
    with open(f"{OUT}/px/proxies.json", "w") as f:
        json.dump(data, f, separators=(",", ":"))


asyncio.run(main())
