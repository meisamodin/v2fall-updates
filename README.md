<div align="center">

<img src="https://v2fall.com/icon-512.png" width="96" alt="V2Fall">

# V2Fall — Free VPN client for Android, Windows, macOS and Linux

**کلاینت VPN و فیلترشکن رایگان برای اندروید، ویندوز، مک و لینوکس**

[![downloads](https://img.shields.io/github/downloads/meisamodin/v2fall-updates/total?label=downloads&color=34D399)](https://github.com/meisamodin/v2fall-updates/releases/latest) [![release](https://img.shields.io/github/v/release/meisamodin/v2fall-updates?label=version&color=60A5FA)](https://github.com/meisamodin/v2fall-updates/releases/latest) [![jsDelivr](https://data.jsdelivr.com/v1/package/gh/meisamodin/v2fall-updates/badge?style=rounded)](https://www.jsdelivr.com/package/gh/meisamodin/v2fall-updates?tab=stats) [![stars](https://img.shields.io/github/stars/meisamodin/v2fall-updates?style=flat&color=FBBF24)](https://github.com/meisamodin/v2fall-updates/stargazers)

### [⬇️ Download / دانلود — v2fall.com](https://v2fall.com) · [Latest release](https://github.com/meisamodin/v2fall-updates/releases/latest) · [Guides](https://v2fall.com/en#guides) · [Telegram](https://t.me/v2fallbot)

</div>

---

## English

V2Fall is a free VPN / proxy client built on the **sing-box** and **Xray** cores, made for heavily filtered networks and internet shutdowns.

- **Every common protocol:** VLESS (REALITY, XHTTP, VLESS Encryption / ML-KEM), VMess, Trojan, Shadowsocks, Hysteria2, TUIC, AnyTLS, WireGuard / AmneziaWG, OpenVPN, SSH, SOCKS / HTTP, sing-box and Xray JSON configs, and subscription links from Marzban, Hiddify, 3x-ui and other panels.
- **Works without a config:** built-in Cloudflare WARP and Psiphon.
- **Internet shutdowns:** bridge server, fast DNS tunnel (DNSTT / MasterDnsVPN), Ashflake volunteer network, and a shutdown mode.
- **Anti-filtering:** TLS Fragment with adjustable strength, UDP noise, mixed-case SNI, ECH, clean Cloudflare IP finder and your own free CDN server.
- **Smart connection:** automatic server testing, failover to the healthiest server, per-network memory of which servers work, config repair, leak test, real speed test.
- **Everywhere:** one app on Android (with a separate build for Android 6), Windows, macOS (Apple Silicon & Intel) and Linux, in 6 languages.

**Install**
- **Android:** open the APK. If Play Protect warns, choose “Install anyway”.
- **Windows:** run the Setup. If SmartScreen appears: More info → Run anyway.
- **macOS:** drag V2Fall to Applications; the first time, right-click → Open. If it says “damaged”: `xattr -cr /Applications/V2Fall.app`
- **Linux:** `sudo apt install ./v2fall_*_amd64.deb`, or unpack the tar.gz and run `./V2Fall` (needs libwebkit2gtk-4.1).

## فارسی

V2Fall (وی‌تو‌فال) یک کلاینت VPN و فیلترشکن رایگان با هسته‌های **sing-box** و **Xray** است، ساخته‌شده برای اینترنت فیلترشدهٔ ایران و زمان قطعی اینترنت.

- **همهٔ پروتکل‌ها:** VLESS (ریلیتی، XHTTP، رمزنگاری VLESS / ML-KEM)، VMess، تروجان، شدوساکس، Hysteria2، TUIC، AnyTLS، وایرگارد و AmneziaWG، OpenVPN، SSH، SOCKS / HTTP، کانفیگ‌های JSON و لینک اشتراک پنل‌های مرزبان، هیدیفای، 3x-ui و بقیه.
- **بدون کانفیگ هم وصل می‌شود:** WARP کلادفلر و سایفون داخلی.
- **قطعی اینترنت:** سرور پل، تونل DNS سریع، شبکهٔ داوطلبانهٔ Ashflake و حالت قطعی.
- **ضد فیلتر:** TLS Fragment با شدت قابل تنظیم، نویز UDP، SNI درهم، ECH، یابندهٔ IP تمیز و سرور CDN شخصی رایگان.
- **اتصال هوشمند:** تست خودکار سرورها، جابه‌جایی خودکار به سالم‌ترین سرور، حافظهٔ هر شبکه، ترمیم کانفیگ، نشت‌سنج و تست سرعت واقعی.
- **روی همهٔ دستگاه‌ها:** اندروید (با نسخهٔ جداگانه برای اندروید ۶)، ویندوز، مک و لینوکس.

**دانلود:** آخرین نسخه را از [v2fall.com](https://v2fall.com) یا [صفحهٔ ریلیز](https://github.com/meisamodin/v2fall-updates/releases/latest) بگیرید. ربات تلگرام [@v2fallbot](https://t.me/v2fallbot) هم فایل‌ها را مستقیم می‌فرستد.

**آموزش‌ها:** [همهٔ تنظیمات به زبان ساده](https://v2fall.com/guide/settings-explained) · [همهٔ ابزارها](https://v2fall.com/guide/tools-explained) · [وقتی اینترنت قطع است](https://v2fall.com/guide/outage) · [IP تمیز](https://v2fall.com/guide/clean-ip) · [سرور CDN شخصی](https://v2fall.com/guide/cdn-server)

## سرور شخصی برای قطعی اینترنت (اختیاری) / Own server for shutdowns (optional)

روی سرور خودتان (اوبونتو/دبیان) با کاربر root اجرا کنید / Run as root on your own Ubuntu/Debian server:

- **سرور پل / Bridge** (روی سروری داخل ایران که به خارج راه دارد / a server inside Iran that still reaches abroad):
```
bash <(curl -fsSL https://github.com/meisamodin/v2fall-updates/raw/main/tools/v2fall-bridge.sh)
```
- **DNSTT** (روی سرور خارج؛ اول یک رکورد NS برای `t.example.com` به سرورتان بسازید / on a server abroad; first point an NS record for `t.example.com` at it):
```
bash <(curl -fsSL https://github.com/meisamodin/v2fall-updates/raw/main/tools/v2fall-dnstt.sh) t.example.com
```
هر اسکریپت در پایان یک لینک می‌دهد که در V2Fall اضافه می‌کنید / each script ends with a link you add in V2Fall.
