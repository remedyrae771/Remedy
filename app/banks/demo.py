"""Демо-банк: генерирует правдоподобные операции, чтобы попробовать синхронизацию без ключей."""
import hashlib
import random
from datetime import date, timedelta
from typing import Optional

from .base import BankAccount, BankTransaction, Connection, Institution

MERCHANTS = [
    ("Пятёрочка", -350, -2500), ("ВкусВилл", -400, -3000), ("Перекрёсток", -500, -4000),
    ("Яндекс Go такси", -250, -900), ("Метро Тройка", -60, -60), ("Кофе Хауз", -200, -600),
    ("Аптека Ригла", -150, -1800), ("МТС мобильная связь", -650, -650), ("Кинопоиск", -299, -299),
    ("Ozon", -500, -6000), ("Лукойл АЗС", -1500, -3500), ("Перевод по СБП", -500, -5000),
]


class DemoProvider:
    name = "demo"
    configured = True

    def list_institutions(self, country: str) -> list[Institution]:
        return [Institution(id="DEMO_BANK", name="Демо-банк (тестовые данные)")]

    def create_connection(self, institution_id: str, redirect_url: str, reference: str) -> Connection:
        # настоящий банк показал бы страницу авторизации; демо сразу возвращает пользователя обратно
        sep = "&" if "?" in redirect_url else "?"
        return Connection(id="demo-connection", link=f"{redirect_url}{sep}ref={reference}")

    def list_accounts(self, connection_id: str) -> list[BankAccount]:
        return [
            BankAccount(external_id="demo-card", name="Демо: дебетовая карта", currency="RUB"),
            BankAccount(external_id="demo-savings", name="Демо: накопительный счёт", currency="RUB"),
        ]

    def fetch_transactions(self, account_external_id: str, date_from: Optional[str]) -> list[BankTransaction]:
        today = date.today()
        start = date.fromisoformat(date_from) if date_from else today - timedelta(days=90)
        txs: list[BankTransaction] = []
        day = start
        while day <= today:
            # детерминированно для каждого дня — повторная синхронизация даёт те же операции
            rng = random.Random(f"{account_external_id}:{day.isoformat()}")
            if account_external_id == "demo-savings":
                if day.day == 1:
                    txs.append(self._tx(account_external_id, day, 0, 1500.0, "Проценты на остаток"))
            else:
                if day.day in (5, 20):
                    txs.append(self._tx(account_external_id, day, 0, 75000.0 if day.day == 5 else 50000.0,
                                        "Зарплата ООО Ромашка" if day.day == 5 else "Аванс ООО Ромашка"))
                if day.day == 10:
                    txs.append(self._tx(account_external_id, day, 1, -35000.0, "Аренда квартиры"))
                for i in range(rng.randint(0, 3)):
                    name, lo, hi = rng.choice(MERCHANTS)
                    amount = float(lo if lo == hi else rng.randint(min(lo, hi), max(lo, hi)))
                    txs.append(self._tx(account_external_id, day, 10 + i, amount, name))
            day += timedelta(days=1)
        return txs

    @staticmethod
    def _tx(acc: str, day: date, n: int, amount: float, description: str) -> BankTransaction:
        ext = hashlib.sha1(f"{acc}|{day}|{n}".encode()).hexdigest()[:16]
        return BankTransaction(external_id=ext, date=day.isoformat(), amount=amount, description=description)
