"""Импорт выписки Kaspi Bank (Kaspi Gold, депозиты) из PDF.

У Kaspi нет открытого API для выписок частных клиентов, но приложение Kaspi.kz выдаёт выписку
в PDF: Kaspi Gold → «Выписка» → период → «Поделиться». Строки операций в ней выглядят так:

    13.05.24   - 2 000,00 ₸   Покупки      Magnum Cash&Carry
    13.05.24   + 50 000,00 ₸  Пополнение   С Kaspi Депозита
    14.05.24   - 5 000,00 ₸   Переводы     Айгерим К.
"""
import hashlib
import io
import re
from datetime import datetime

from .base import BankError, BankTransaction

# дата, знак, сумма, валюта, тип операции, детали
LINE_RE = re.compile(
    r"^\s*(\d{2}\.\d{2}\.\d{2,4})\s+"
    r"([+\-−–])\s*"
    r"(\d{1,3}(?:[   ]?\d{3})*(?:[.,]\d{1,2})?)\s*"
    r"(₸|KZT|тг\.?|\$|USD|€|EUR|₽|RUB)?\s*"
    r"(.*?)\s*$"
)
OPERATION_TYPES = ("Покупки", "Пополнение", "Переводы", "Снятия", "Разное", "Платежи", "Покупка",
                   "Перевод", "Снятие", "Платёж", "Платеж", "Бонусы", "Погашение")
CURRENCIES = {"₸": "KZT", "KZT": "KZT", "тг": "KZT", "тг.": "KZT", "$": "USD", "USD": "USD",
              "€": "EUR", "EUR": "EUR", "₽": "RUB", "RUB": "RUB"}


def looks_like_kaspi(text: str) -> bool:
    t = text.lower()
    return "kaspi" in t or "каспи" in t


def _parse_date(s: str) -> str:
    fmt = "%d.%m.%y" if len(s) == 8 else "%d.%m.%Y"
    return datetime.strptime(s, fmt).date().isoformat()


def parse_kaspi_text(text: str) -> tuple[list[BankTransaction], str]:
    """Разбирает текст выписки. Возвращает операции и валюту счёта."""
    txs: list[BankTransaction] = []
    currencies: dict[str, int] = {}
    seen: dict[str, int] = {}
    for line in text.splitlines():
        m = LINE_RE.match(line)
        if not m:
            continue
        raw_date, sign, raw_amount, cur, rest = m.groups()
        try:
            date = _parse_date(raw_date)
        except ValueError:
            continue
        amount = float(re.sub(r"[   ]", "", raw_amount).replace(",", "."))
        if amount == 0:
            continue
        if sign != "+":
            amount = -amount
        if cur:
            code = CURRENCIES.get(cur, "KZT")
            currencies[code] = currencies.get(code, 0) + 1
        # «Покупки Magnum» → «Покупки: Magnum»
        description = re.sub(r"\s{2,}", " ", rest)
        for op in OPERATION_TYPES:
            if description.startswith(op + " "):
                description = f"{op}: {description[len(op) + 1:].strip()}"
                break
        base = hashlib.sha1(f"kaspi|{date}|{amount}|{description}".encode()).hexdigest()[:20]
        n = seen.get(base, 0)  # несколько одинаковых операций в один день — разные id
        seen[base] = n + 1
        txs.append(BankTransaction(external_id=f"{base}-{n}", date=date, amount=amount, description=description))
    currency = max(currencies, key=currencies.get) if currencies else "KZT"
    return txs, currency


def pdf_to_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise BankError("Для PDF-выписок установите пакет pypdf: pip install pypdf") from e
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")
        pages = []
        for page in reader.pages:
            try:  # режим layout сохраняет колонки таблицы в одной строке
                pages.append(page.extract_text(extraction_mode="layout"))
            except Exception:
                pages.append(page.extract_text() or "")
        return "\n".join(pages)
    except BankError:
        raise
    except Exception as e:
        raise BankError(f"Не удалось прочитать PDF: {e}") from e


def parse_kaspi_pdf(data: bytes) -> tuple[list[BankTransaction], str]:
    text = pdf_to_text(data)
    txs, currency = parse_kaspi_text(text)
    if not txs:
        raise BankError("В PDF не найдено операций. Поддерживаются выписки Kaspi Bank; "
                        "если это выписка Kaspi — пришлите разработчику пример строки, формат мог измениться.")
    return txs, currency
