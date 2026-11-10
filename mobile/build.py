"""Собирает мобильную версию Aqsha (одна HTML-страница для claude.ai) из шаблона.

Категории, правила автокатегоризации и советы берутся из основного приложения,
чтобы у обеих версий был один источник:

    python3 mobile/build.py            # → mobile/aqsha.html
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.categorize import LOW_PRIORITY  # noqa: E402
from app.db import DEFAULT_CATEGORIES, DEFAULT_RULES  # noqa: E402
from app.tips_library import TIPS, TOPICS  # noqa: E402


def js(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "template.html"), encoding="utf-8") as f:
        html = f.read()
    with open(os.path.join(ROOT, "frontend", "icons", "icon.svg"), encoding="utf-8") as f:
        icon = f.read().strip()
    data = {
        "/*__CATEGORIES__*/[]": js([{"name": n, "kind": k, "color": c} for n, k, c in DEFAULT_CATEGORIES]),
        "/*__RULES__*/[]": js([[p, cat] for cat, patterns in DEFAULT_RULES.items() for p in patterns]),
        "/*__LOW_PRIORITY__*/[]": js(sorted(LOW_PRIORITY)),
        "/*__TOPICS__*/{}": js(TOPICS),
        "/*__TIPS__*/[]": js([[t, i, title, text] for t, i, title, text in TIPS]),
        "<!--__ICON__-->": icon.replace('<svg ', '<svg class="logo" aria-hidden="true" ', 1),
    }
    for key, value in data.items():
        assert key in html, f"нет метки {key} в шаблоне"
        html = html.replace(key, value)
    return html


# Отдельный сайт (GitHub Pages): полный документ со своей иконкой и манифестом,
# чтобы с главного экрана Aqsha открывалась как приложение, без адресной строки.
SITE_HEAD = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Aqsha — учёт доходов и расходов в тенге: выписки Kaspi, быстрый ввод, советы.">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Aqsha">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
"""

MANIFEST = {
    "name": "Aqsha — учёт финансов", "short_name": "Aqsha", "lang": "ru",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#f7f5ef", "theme_color": "#007a92",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}


SITE_URL = "https://remedyrae771.github.io/Remedy/"


def ics(uid: str, summary: str, description: str, start: str, rule: str) -> str:
    """Повторяющееся событие с напоминанием в момент начала. Время «плавающее» — местное время телефона."""
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aqsha//Reminders//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT", f"UID:{uid}@aqsha", "DTSTAMP:20260101T000000Z", f"DTSTART:{start}", "DURATION:PT10M",
        f"RRULE:{rule}", f"SUMMARY:{ics_text(summary)}", f"DESCRIPTION:{ics_text(description)}", f"URL:{SITE_URL}#add",
        "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(summary)}", "TRIGGER:PT0M", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return "\r\n".join(fold(line) for line in lines) + "\r\n"


def ics_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")


def fold(line: str) -> str:
    """Строки iCalendar — не длиннее 75 байт; продолжение начинается с пробела (RFC 5545)."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode()) > (75 if not out else 74):
            out.append(cur); cur = ""
        cur += ch
    out.append(cur)
    return "\r\n ".join(out)


def build_reminders(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for hhmm in ("1900", "2000", "2100", "2200"):
        with open(os.path.join(out_dir, f"evening-{hhmm}.ics"), "w", encoding="utf-8", newline="") as f:
            f.write(ics(f"evening-{hhmm}", "Aqsha: запишите расходы за сегодня",
                        f"Пара секунд: откройте Aqsha и нажмите «+». {SITE_URL}#add",
                        f"20260101T{hhmm}00", "FREQ=DAILY"))
    with open(os.path.join(out_dir, "monthly-statement.ics"), "w", encoding="utf-8", newline="") as f:
        f.write(ics("monthly-statement", "Aqsha: выписка Kaspi за прошлый месяц",
                    f"Kaspi.kz → Kaspi Gold → Выписка → PDF, затем Aqsha → Ещё → Выписка. И сохраните резервную копию. {SITE_URL}",
                    "20260101T100000", "FREQ=MONTHLY;BYMONTHDAY=1"))


def build_site(page: str, out_dir: str) -> None:
    import shutil
    os.makedirs(os.path.join(out_dir, "icons"), exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(SITE_HEAD + page + "\n</body>\n</html>\n")
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(MANIFEST, f, ensure_ascii=False, indent=2)
    src = os.path.join(ROOT, "frontend", "icons")
    for name in ("icon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        shutil.copy(os.path.join(src, name), os.path.join(out_dir, "icons", name))
    open(os.path.join(out_dir, ".nojekyll"), "w").close()  # GitHub Pages отдаёт файлы как есть
    build_reminders(os.path.join(out_dir, "reminders"))


if __name__ == "__main__":
    page = build()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aqsha.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(out, os.path.getsize(out), "bytes")
    site = os.path.join(ROOT, "docs")
    build_site(page, site)
    print(os.path.join(site, "index.html"), "— сайт для GitHub Pages")
