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
