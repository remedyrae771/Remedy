"""Импорт банковских выписок из файлов: CSV (Т-Банк, Альфа, универсальный) и OFX/QFX.

Работает с любым банком, который умеет выгружать выписку, — в том числе с российскими банками,
у которых нет публичного API для частных клиентов.
"""
import csv
import hashlib
import io
import re
from datetime import datetime
from typing import Optional

from .base import BankError, BankTransaction

DATE_HEADERS = ["дата операции", "дата проводки", "дата", "date", "booking date", "transaction date"]
AMOUNT_HEADERS = ["сумма платежа", "сумма операции", "сумма", "amount"]
DESC_HEADERS = ["описание", "назначение платежа", "назначение", "контрагент", "description", "payee", "memo"]
CATEGORY_HEADERS = ["категория", "category"]
STATUS_HEADERS = ["статус", "status"]
INCOME_HEADERS = ["приход", "поступление", "credit", "зачисление"]
EXPENSE_HEADERS = ["расход", "списание", "debit"]


def decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1251"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def parse_amount(value: str) -> Optional[float]:
    s = (value or "").strip().replace(" ", "").replace(" ", "").replace("₽", "")
    s = re.sub(r"[A-Za-zА-Яа-я]", "", s)
    if not s:
        return None
    if "," in s and "." in s:            # 1,234.56 или 1.234,56
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(",", ".")
    s = s.replace("−", "-")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(value: str) -> Optional[str]:
    s = (value or "").strip()
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    head = s.split(" ")[0].split("T")[0]
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(head, fmt).date().isoformat()
        except ValueError:
            continue
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _find(headers: list[str], candidates: list[str]) -> Optional[int]:
    norm = [h.strip().lower() for h in headers]
    for c in candidates:              # сначала точное совпадение, в порядке приоритета
        if c in norm:
            return norm.index(c)
    for c in candidates:
        for i, h in enumerate(norm):
            if c in h:
                return i
    return None


def _make_id(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:20]


def parse_csv(data: bytes) -> list[BankTransaction]:
    text = decode(data)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";" if sample.count(";") > sample.count(",") else ","
    rows = list(csv.reader(io.StringIO(text), dialect))
    # ищем строку заголовка (некоторые банки пишут шапку выписки сверху)
    header_idx = next((i for i, r in enumerate(rows[:30])
                       if _find(r, DATE_HEADERS) is not None
                       and (_find(r, AMOUNT_HEADERS) is not None or _find(r, INCOME_HEADERS) is not None)), None)
    if header_idx is None:
        raise BankError("Не удалось найти в CSV колонки с датой и суммой")
    headers = rows[header_idx]
    i_date = _find(headers, DATE_HEADERS)
    i_amount = _find(headers, AMOUNT_HEADERS)
    i_income = _find(headers, INCOME_HEADERS)
    i_expense = _find(headers, EXPENSE_HEADERS)
    i_desc = _find(headers, DESC_HEADERS)
    i_cat = _find(headers, CATEGORY_HEADERS)
    i_status = _find(headers, STATUS_HEADERS)

    result: list[BankTransaction] = []
    seen: dict[str, int] = {}
    for row in rows[header_idx + 1:]:
        if not row or len(row) <= i_date:
            continue
        if i_status is not None and len(row) > i_status and row[i_status].strip().upper() in ("FAILED", "ОТКЛОНЕНА"):
            continue
        date = parse_date(row[i_date])
        if not date:
            continue
        if i_amount is not None:
            amount = parse_amount(row[i_amount])
        else:
            inc = parse_amount(row[i_income]) if i_income is not None and len(row) > i_income else None
            exp = parse_amount(row[i_expense]) if i_expense is not None and len(row) > i_expense else None
            amount = (inc or 0) - abs(exp or 0)
        if amount is None or amount == 0:
            continue
        desc = row[i_desc].strip() if i_desc is not None and len(row) > i_desc else ""
        if i_cat is not None and len(row) > i_cat and row[i_cat].strip() and row[i_cat].strip() not in desc:
            desc = f"{desc} ({row[i_cat].strip()})" if desc else row[i_cat].strip()
        base = _make_id(row[i_date], amount, desc)
        n = seen.get(base, 0)       # одинаковые операции в один день — разные id
        seen[base] = n + 1
        result.append(BankTransaction(external_id=f"{base}-{n}", date=date, amount=amount, description=desc))
    return result


def _ofx_tag(block: str, tag: str) -> Optional[str]:
    m = re.search(rf"<{tag}>([^<\r\n]*)", block, re.IGNORECASE)
    return m.group(1).strip() if m else None


def parse_ofx(data: bytes) -> list[BankTransaction]:
    text = decode(data)
    blocks = re.findall(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|</BANKTRANLIST>)", text, re.S | re.I)
    result = []
    for b in blocks:
        amount = parse_amount(_ofx_tag(b, "TRNAMT") or "")
        raw_date = (_ofx_tag(b, "DTPOSTED") or "")[:8]
        date = parse_date(raw_date)
        if amount is None or not date:
            continue
        desc = " ".join(filter(None, [_ofx_tag(b, "NAME"), _ofx_tag(b, "MEMO")]))
        ext = _ofx_tag(b, "FITID") or _make_id(raw_date, amount, desc)
        result.append(BankTransaction(external_id=ext, date=date, amount=amount, description=desc))
    return result


def parse_statement(filename: str, data: bytes) -> list[BankTransaction]:
    name = filename.lower()
    if name.endswith((".ofx", ".qfx")) or b"<OFX>" in data[:2000].upper():
        return parse_ofx(data)
    if name.endswith((".csv", ".txt", ".tsv")):
        return parse_csv(data)
    raise BankError("Поддерживаются файлы CSV и OFX/QFX")
