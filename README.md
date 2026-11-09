# V2Fall 18.7

[![downloads](https://img.shields.io/github/downloads/meisamodin/v2fall-updates/total?label=downloads&color=34D399)](https://github.com/meisamodin/v2fall-updates/releases) [![jsDelivr](https://data.jsdelivr.com/v1/package/gh/meisamodin/v2fall-updates/badge?style=rounded)](https://www.jsdelivr.com/package/gh/meisamodin/v2fall-updates?tab=stats) [![stars](https://img.shields.io/github/stars/meisamodin/v2fall-updates?style=flat&color=FBBF24)](https://github.com/meisamodin/v2fall-updates/stargazers)

کلاینت VPN برای اندروید، ویندوز، مک و لینوکس (هسته‌های sing-box و Xray).

| سیستم | دانلود | حجم |
|---|---|---|
| اندروید — گوشی‌های جدید (arm64، پیشنهادی) | [V2Fall-18.7-arm64.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7-arm64.apk) | 39 MB |
| اندروید — گوشی‌های قدیمی (armv7) | [V2Fall-18.7-armv7.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7-armv7.apk) | 40 MB |
| اندروید — همه‌کاره (اگر نمی‌دانید کدام) | [V2Fall-18.7.apk](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7.apk) | 79 MB |
| ویندوز | [V2Fall-Setup-18.7.exe](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-Setup-18.7.exe) | 33 MB |
| مک (Apple Silicon: M1/M2/M3/M4) | [V2Fall-18.7-macOS-Apple-Silicon.dmg](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7-macOS-Apple-Silicon.dmg) | 56 MB |
| مک (Intel) | [V2Fall-18.7-macOS-Intel.dmg](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7-macOS-Intel.dmg) | 63 MB |
| لینوکس (.deb اوبونتو/دبیان) | [v2fall_18.7_amd64.deb](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/v2fall_18.7_amd64.deb) | 40 MB |
| لینوکس (tar.gz) | [V2Fall-18.7-Linux-x64.tar.gz](https://github.com/meisamodin/v2fall-updates/releases/download/v18.7/V2Fall-18.7-Linux-x64.tar.gz) | 50 MB |

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
- **لینوکس:** `sudo apt install ./v2fall_18.7_amd64.deb` یا tar.gz را باز کنید و `./V2Fall` را اجرا کنید (نیاز به libwebkit2gtk-4.1).

## تغییرات این نسخه
**گزینهٔ «نسخه‌های آزمایشی»** در «تنظیمات → درباره و به‌روزرسانی» — قابلیت‌های جدید را قبل از انتشار رسمی دریافت کنید و هر وقت خواستید با دکمهٔ «دریافت نسخهٔ پایدار» برگردید. بررسی به‌روزرسانی هوشمندتر شد و منوی انتخاب متن اندروید دیگر روی رابط برنامه ظاهر نمی‌شود.

---

New «Experimental updates» toggle in Settings → About & updates — get new features before the official release and roll back any time with «Get the stable version». Smarter update check (ignores stale CDN answers); the Android text-selection menu no longer pops up over the UI.

---

## تغییرات نسخهٔ آزمایشی (Experimental)

این نسخه‌ها برای تست هستند و هنوز رسمی منتشر نشده‌اند. برای دریافتشان در برنامه به «تنظیمات → درباره و به‌روزرسانی» بروید و دکمهٔ «دریافت نسخهٔ آزمایشی» را بزنید (یا «نسخه‌های آزمایشی» را روشن کنید). نصب روی نسخهٔ فعلی انجام می‌شود و نیازی به حذف برنامه نیست — یا مستقیم دانلود کنید:

| سیستم | دانلود مستقیم ۱۸٫۸٫۱۰ (rc11) | حجم |
|---|---|---|
| اندروید — گوشی‌های جدید (arm64، پیشنهادی) | [V2Fall-18.8rc11-arm64.apk](https://github.com/meisamodin/v2fall-updates/releases/download/exp-v18.8.10/V2Fall-18.8rc11-arm64.apk) | 54 MB |
| اندروید — گوشی‌های قدیمی (armv7) | [V2Fall-18.8rc11-armv7.apk](https://github.com/meisamodin/v2fall-updates/releases/download/exp-v18.8.10/V2Fall-18.8rc11-armv7.apk) | 55 MB |
| ویندوز | [V2Fall-Setup-18.8rc11.exe](https://github.com/meisamodin/v2fall-updates/releases/download/exp-v18.8.10/V2Fall-Setup-18.8rc11.exe) | 39 MB |

### 18.8.10 (آزمایشی rc11) — ۲۰۲۶-۱۱-۰۹
- **رفع وصل‌نشدن کانفیگ‌های تحت Xray روی اندروید** (VLESS با رمزنگاری mlkem768x25519plus و…): هستهٔ Xray حالا دامنه‌ها را با DNSهای داخل ایران (شکن/الکترو/بگذر) resolve می‌کند — قبلاً روی اندروید به DNS مردهٔ 127.0.0.1 می‌افتاد
- **دانلود به‌روزرسانی دسکتاپ**: دیگر از پروکسی سیستم رد نمی‌شود (با VPN روشن روی ۰٪ گیر نمی‌کند) و با قطع‌شدن وسط دانلود، از همان‌جا ادامه می‌دهد

### Experimental 18.8.10 (rc11) — 2026-11-09 (English)
- **Fix Xray-routed configs not connecting on Android** (VLESS with mlkem768x25519plus encryption etc.): the Xray helper now resolves domains via Iranian public DNS (Shekan/Electro/Begzar) instead of hitting a dead 127.0.0.1 resolver
- **Desktop update downloads**: no longer go through the system proxy (no more 0% stall with the VPN on) and resume where they left off after a connection drop

### 18.8.9 (آزمایشی rc10) — ۲۰۲۶-۱۱-۰۹
- **پاک‌سازی مهربان‌تر**: سرورهای کند و بی‌پاسخ دیگر حذف نمی‌شوند — به انتهای لیست می‌روند، کم‌رنگ می‌شوند و دیگر پینگ نمی‌خورند؛ از منوی هر سرور می‌توانید برگردانیدش
- **«فقط سریع‌ترین‌های هر اشتراک»** هم به‌جای حذف، سرورهای اضافه را به انتهای لیست می‌فرستد

### Experimental 18.8.9 (rc10) — 2026-11-09 (English)
- **Gentler cleanup**: slow and dead servers are no longer deleted — they sink to the end of the list, dimmed, and stop being pinged; restore any of them from its menu
- **«Keep only the fastest of each subscription»** now demotes extra servers instead of deleting them

### 18.8.8 (آزمایشی rc9) — ۲۰۲۶-۱۱-۰۹
- **دو دکمهٔ جدا** در «تنظیمات → درباره و به‌روزرسانی»: «دریافت نسخهٔ آزمایشی» و «دریافت نسخهٔ پایدار» — جابه‌جایی بین کانال‌ها با یک لمس
- **نصب بدون حذف برنامه**: شمارهٔ ساخت نسخهٔ آزمایشی همیشه از پایدار جدیدتر است، پس روی نسخهٔ پایدار مستقیم نصب می‌شود (رفع خطای INSTALL_FAILED_VERSION_DOWNGRADE)

### Experimental 18.8.8 (rc9) — 2026-11-09 (English)
- **Two separate buttons** in Settings → About & updates: «Get the experimental version» and «Get the stable version» — switch channels with one tap
- **Installs without uninstalling**: the experimental build number is always newer than stable, so it installs right over the stable release (fixes INSTALL_FAILED_VERSION_DOWNGRADE)

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
