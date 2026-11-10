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


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aqsha.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build())
    print(out, os.path.getsize(out), "bytes")
