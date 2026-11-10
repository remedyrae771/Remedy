"""Общий интерфейс банковских провайдеров."""
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass
class BankTransaction:
    external_id: str
    date: str          # YYYY-MM-DD
    amount: float      # > 0 доход, < 0 расход
    description: str


@dataclass
class BankAccount:
    external_id: str
    name: str
    currency: str


@dataclass
class Institution:
    id: str
    name: str
    logo: Optional[str] = None


@dataclass
class Connection:
    id: str            # id подключения у провайдера
    link: str          # куда отправить пользователя для авторизации в банке


class BankProvider(Protocol):
    name: str

    def list_institutions(self, country: str) -> list[Institution]: ...

    def create_connection(self, institution_id: str, redirect_url: str, reference: str) -> Connection: ...

    def list_accounts(self, connection_id: str) -> list[BankAccount]: ...

    def fetch_transactions(self, account_external_id: str, date_from: Optional[str]) -> list[BankTransaction]: ...


class BankError(Exception):
    pass
