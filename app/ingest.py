"""Операции без выписки: из текста уведомлений банка (пуш/SMS), из Apple Wallet и из быстрого ввода.

Это обход отсутствия банковского API. Телефон пересылает сюда текст уведомления, а при импорте
PDF-выписки такие операции не задваиваются, а сливаются с операциями из выписки (см. merge_with_pushed).
"""
import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from .banks.importers import parse_date

NUM = r"[-+−]?\s?\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,2})?|[-+−]?\s?\d+(?:[.,]\d{1,2})?"
CUR = r"(?:₸|kzt|тг\.?|тенге|т\b)"
AMOUNT_RE = re.compile(rf"({NUM})\s*{CUR}", re.IGNORECASE)
# суммы, которые не являются суммой операции
BALANCE_WORDS = ("доступно", "баланс", "остаток", "на счете", "на счёте", "кэшбэк", "бонус", "комиссия")
INCOME_WORDS = ("пополнение", "поступление", "зачисление", "зачислено", "возврат", "получен", "входящий",
                "перевод от", "вам перевели", "заработная", "зарплата", "кэшбэк зачислен")
EXPENSE_WORDS = ("покупка", "оплата", "списание", "списано", "снятие", "перевод", "платеж", "платёж",
                 "погашение", "оплачено", "purchase", "payment")
# служебные слова, которые не нужны в описании
NOISE_RE = re.compile(r"\b(kaspi gold|kaspi(\.kz)?|карта|карты|по карте|\*\d{4}|\d{2}:\d{2}(:\d{2})?)\b", re.IGNORECASE)


@dataclass
class Parsed:
    amount: float
    description: str
    date: str


def _to_float(raw: str) -> float:
    return float(re.sub(r"[\s  +]", "", raw).replace("−", "-").replace(",", "."))


def _clean(text: str) -> str:
    text = NOISE_RE.sub(" ", text)
    text = re.sub(r"[\s.,:;—–-]+$", "", re.sub(r"^[\s.,:;—–-]+", "", text))
    return re.sub(r"\s{2,}", " ", text).strip()


def parse_notification(text: str, today: Optional[date] = None) -> Optional[Parsed]:
    """Разбирает текст пуша/SMS банка: «Покупка 2 500,00 ₸ MAGNUM. Доступно 123 456 ₸»."""
    today = today or date.today()
    flat = " ".join((text or "").split())
    low = flat.lower()
    amount_match = None
    for m in AMOUNT_RE.finditer(flat):
        before = low[max(0, m.start() - 25):m.start()]
        if not any(w in before for w in BALANCE_WORDS):
            amount_match = m
            break
    if not amount_match:
        return None
    amount = abs(_to_float(amount_match.group(1)))
    if amount == 0:
        return None
    raw = amount_match.group(1).strip()
    if raw.startswith("+"):
        sign = 1
    elif raw.startswith(("-", "−")):
        sign = -1
    elif any(w in low for w in INCOME_WORDS) and not low.startswith(("покупка", "оплата")):
        sign = 1
    else:
        sign = -1  # по умолчанию уведомление — это трата
    # описание: что после суммы до «Доступно…», иначе — что до суммы
    after = flat[amount_match.end():]
    cut = re.search("|".join(BALANCE_WORDS), after, re.IGNORECASE)
    after = after[:cut.start()] if cut else after
    before = flat[:amount_match.start()]
    description = _clean(after) or _clean(before)
    description = re.sub(r"\b\d{2}\.\d{2}\.\d{2,4}\b", "", description).strip(" .,")
    op = re.search(r"(покупка|оплата|перевод|перевели|пополнение|снятие|платеж|платёж|возврат|списание)",
                   before.lower())
    if op:
        label = "Перевод" if op.group(1) == "перевели" else op.group(1).capitalize()
        if not description.lower().startswith(label.lower()):
            description = f"{label}: {description}" if description else label
    # дата, если есть в тексте (иначе — сегодня)
    d = re.search(r"\b(\d{2}\.\d{2}\.\d{2,4})\b", flat)
    parsed_date = parse_date(d.group(1)) if d else None
    if not parsed_date or not (today - timedelta(days=60) <= date.fromisoformat(parsed_date) <= today + timedelta(days=1)):
        parsed_date = today.isoformat()
    return Parsed(amount=round(sign * amount, 2), description=description[:200] or "Операция", date=parsed_date)


QUICK_RE = re.compile(rf"^(?P<a>[+-−]?\s?\d[\d  ]*(?:[.,]\d{{1,2}})?)\s*{CUR}?\s+(?P<d>.+)$|"
                      rf"^(?P<d2>.+?)\s+(?P<a2>[+-−]?\s?\d[\d  ]*(?:[.,]\d{{1,2}})?)\s*{CUR}?$", re.IGNORECASE)


def parse_quick(text: str, today: Optional[date] = None) -> Optional[Parsed]:
    """Быстрый ввод: «кофе 1500», «1500 кофе», «+450000 зарплата», «такси 1 200 ₸»."""
    today = today or date.today()
    s = " ".join((text or "").split())
    m = QUICK_RE.match(s)
    if not m:
        return None
    raw = (m.group("a") or m.group("a2")).strip()
    desc = (m.group("d") or m.group("d2")).strip()
    try:
        value = _to_float(raw)
    except ValueError:
        return None
    if value == 0:
        return None
    if raw.startswith("+"):
        amount = abs(value)
    elif raw.startswith(("-", "−")):
        amount = -abs(value)
    else:  # без знака: доход, только если это явно доход
        amount = abs(value) if any(w in desc.lower() for w in INCOME_WORDS + ("доход", "аванс", "премия")) else -abs(value)
    return Parsed(amount=round(amount, 2), description=desc[:200], date=today.isoformat())


def push_external_id(text: str, day: str) -> str:
    return "push-" + hashlib.sha1(f"{day}|{' '.join(text.split())}".encode()).hexdigest()[:20]


def merge_with_pushed(conn: sqlite3.Connection, account_id: int, t) -> bool:
    """Если операция из выписки уже пришла раньше уведомлением — привязываем её, а не создаём дубль.

    Совпадение: та же сумма, дата ±2 дня, операция из уведомления ещё не сверена с выпиской.
    Быстрый ввод не сливаем: это часто наличные, и совпадение суммы с покупкой по карте было бы случайным.
    Описание и id берём из выписки (они точнее), категорию оставляем — её могли поправить вручную.
    """
    d = date.fromisoformat(t.date)
    row = conn.execute(
        "SELECT id FROM transactions WHERE source = 'push' AND ROUND(amount, 2) = ?"
        " AND date BETWEEN ? AND ? ORDER BY ABS(julianday(date) - julianday(?)), id LIMIT 1",
        (round(t.amount, 2), (d - timedelta(days=2)).isoformat(), (d + timedelta(days=2)).isoformat(), t.date),
    ).fetchone()
    if not row:
        return False
    conn.execute(
        "UPDATE transactions SET account_id = ?, date = ?, description = ?, external_id = ?, source = NULL WHERE id = ?",
        (account_id, t.date, t.description, t.external_id, row["id"]),
    )
    return True
