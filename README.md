# V2Fall 18.6

[![downloads](https://img.shields.io/github/downloads/meisamodin/v2fall-updates/total?label=downloads&color=34D399)](https://github.com/meisamodin/v2fall-updates/releases) [![jsDelivr](https://data.jsdelivr.com/v1/package/gh/meisamodin/v2fall-updates/badge?style=rounded)](https://www.jsdelivr.com/package/gh/meisamodin/v2fall-updates?tab=stats) [![stars](https://img.shields.io/github/stars/meisamodin/v2fall-updates?style=flat&color=FBBF24)](https://github.com/meisamodin/v2fall-updates/stargazers)

کلاینت VPN برای اندروید، ویندوز، مک و لینوکس (هسته‌های sing-box و Xray).

| سیستم | دانلود | حجم |
|---|---|---|
| اندروید — گوشی‌های جدید (arm64، پیشنهادی) | [V2Fall-18.6-arm64.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6-arm64.apk) | 38 MB |
| اندروید — گوشی‌های قدیمی (armv7) | [V2Fall-18.6-armv7.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6-armv7.apk) | 39 MB |
| اندروید — همه‌کاره (اگر نمی‌دانید کدام) | [V2Fall-18.6.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6.apk) | 77 MB |
| ویندوز | [V2Fall-Setup-18.6.exe](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-Setup-18.6.exe) | 31 MB |
| مک (Apple Silicon: M1/M2/M3/M4) | [V2Fall-18.6-macOS-Apple-Silicon.dmg](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6-macOS-Apple-Silicon.dmg) | 54 MB |
| مک (Intel) | [V2Fall-18.6-macOS-Intel.dmg](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6-macOS-Intel.dmg) | 60 MB |
| لینوکس (.deb اوبونتو/دبیان) | [v2fall_18.6_amd64.deb](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/v2fall_18.6_amd64.deb) | 38 MB |
| لینوکس (tar.gz) | [V2Fall-18.6-Linux-x64.tar.gz](https://github.com/meisamodin/v2fall-updates/releases/download/v18.6/V2Fall-18.6-Linux-x64.tar.gz) | 48 MB |

## سرور شخصی برای قطعی اینترنت (اختیاری)
روی سرور خودتان (اوبونتو/دبیان) با کاربر root اجرا کنید:

- **سرور پل** (روی سروری داخل ایران که به خارج راه دارد):
```
bash <(curl -fsSL https://github.com/meisamodin/v2fall-updates/raw/main/tools/v2fall-bridge.sh)
```
- **DNSTT** (روی سرور خارج از ایران؛ اول برای `t.example.com` یک رکورد NS به سرورتان بسازید):
```
bash <(curl -fsSL https://github.com/meisamodin/v2fall-updates/raw/main/tools/v2fall-dnstt.sh) t.example.com
```
هر اسکریپت در پایان یک لینک می‌دهد که در V2Fall اضافه می‌کنید.

## نصب
- **اندروید:** فایل APK را باز کنید. اگر Play Protect پیغام داد، «Install without scanning» یا «Scan app» را بزنید (برای هر برنامهٔ خارج از گوگل‌پلی پیش می‌آید).
- **ویندوز:** Setup را اجرا کنید. اگر SmartScreen آمد: More info → Run anyway.
- **مک:** فایل dmg را باز کنید و V2Fall را داخل Applications بکشید. بار اول روی برنامه کلیک راست → Open (چون امضای اپل ندارد). اگر گفت «آسیب دیده»: در Terminal بزنید `xattr -cr /Applications/V2Fall.app`
- **لینوکس:** `sudo apt install ./v2fall_18.6_amd64.deb` یا tar.gz را باز کنید و `./V2Fall` را اجرا کنید (نیاز به libwebkit2gtk-4.1).

## تغییرات این نسخه
رفع مشکل باز کردن کد اشتراک روی کامپیوتر، قفل کانفیگ به V2Fall، ابزار ارسال با پیامک، شروع و اتصال خودکار

---

Fix opening a subscription code on desktop, lock configs to V2Fall, SMS tool, reliable autostart

---

## تغییرات نسخهٔ آزمایشی (Experimental)

این نسخه‌ها برای تست هستند و هنوز رسمی منتشر نشده‌اند. برای دریافتشان در برنامه به «تنظیمات → درباره و به‌روزرسانی» بروید و «نسخه‌های آزمایشی» را روشن کنید.

### 18.8.7 (آزمایشی rc7+rc8) — ۲۰۲۶-۱۱-۰۹
- **پشتیبانی از AmneziaWG**: فایل‌های ‎.conf‎ با پارامترهای مبهم‌سازی (Jc/Jmin/Jmax/S1-S2/H1-H4 و…) مستقیم وارد و وصل می‌شوند — هستهٔ جداگانهٔ AmneziaWG v3.1 روی اندروید، ویندوز، مک و لینوکس
- **پاک‌سازی لیست سرورها**: حذف سرورهای کند (بالای ۱۵۰۰ میلی‌ثانیه) و بی‌پاسخ از منوی سرورها + فیلتر «سریع»
- **گزینهٔ «فقط سریع‌ترین‌های هر اشتراک»**: بعد از هر بروزرسانی اشتراک، سرورهای کند حذف می‌شوند (پین‌شده‌ها می‌مانند)
- **پیشنهاد هوشمند WARP**: بعد از چند اتصال ناموفق پشت سر هم، اپ WARP کلادفلر (بدون نیاز به سرور) را پیشنهاد می‌دهد

### Experimental 18.8.7 (rc7+rc8) — 2026-11-09 (English)
- **AmneziaWG support**: .conf files with obfuscation parameters (Jc/Jmin/Jmax/S1-S2/H1-H4…) import and connect directly — standalone AmneziaWG v3.1 core on Android, Windows, macOS and Linux
- **Server list cleanup**: remove slow (over 1500 ms) and dead servers from the servers menu + a «Fast» filter chip
- **«Keep only the fastest of each subscription»**: slow servers are pruned after every subscription update (pinned ones stay)
- **Smart WARP suggestion**: after several failed connections in a row, the app suggests built-in Cloudflare WARP (no server needed)

### 18.8.6 (آزمایشی rc6) — ۲۰۲۶-۱۱-۰۹
- **WARP داخلی کلادفلر**: اتصال بدون نیاز به سرور شخصی از «افزودن → WARP» — حالت گول (وارپ‌در‌وارپ، پیش‌فرض)، حالت سایفون (CFON، عبور وارپ از شبکهٔ Psiphon با انتخاب کشور)، وارپ ساده، و اسکن خودکار اندپوینت کلادفلر — روی اندروید، ویندوز، مک و لینوکس
- **دکمهٔ «دریافت نسخهٔ پایدار»** در «تنظیمات → درباره»: اگر نسخهٔ آزمایشی مشکل داشت، با یک لمس به نسخهٔ رسمی برگردید (کانال آزمایشی خودکار خاموش می‌شود)

### Experimental 18.8.6 (rc6) — 2026-11-09 (English)
- **Built-in Cloudflare WARP**: connect without your own server via Add → WARP — Gool (warp-in-warp, default), CFON (WARP over the Psiphon network, country selectable), plain WARP, and automatic Cloudflare endpoint scan — on Android, Windows, macOS and Linux
- **«Get the stable version» button** in Settings → About: one tap back to the official release if an experimental build misbehaves (the experimental channel turns off automatically)

### 18.8 (آزمایشی) — ۲۰۲۶-۱۱-۰۹
- اتصال کانفیگ‌های VLESS با رمزنگاری mlkem768 (هستهٔ Xray جدید) برطرف شد
- خواندن فایل WireGuard با فرمت ‎.conf
- حذف خودکار سطرهای تبلیغاتی و اطلاعاتی از لیست اشتراک
- دکمهٔ اتصال با حلقهٔ نئون و تم سبز کامل هنگام اتصال
- زبان اعلان برنامه مطابق زبان داخل برنامه
- افزودن خودکار کانفیگ و لینک از کلیبورد
- پشتیبانی از پروتکل Mieru
- پشتیبانی از Android TV (اجرا با ریموت کنترل)
- کانال به‌روزرسانی آزمایشی در تنظیمات برنامه

### Experimental 18.8 — 2026-11-09 (English)
- Fixed VLESS configs with mlkem768 encryption (new Xray core)
- Read WireGuard .conf files
- Promo/info rows filtered out of subscription lists
- Neon power ring + full green theme while connected
- Notification language follows the app language
- Auto-import configs and links from the clipboard
- Mieru protocol support
- Android TV support (remote control)
- Experimental update channel in settings
