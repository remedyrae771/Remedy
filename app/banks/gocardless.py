"""Провайдер GoCardless Bank Account Data (бывший Nordigen) — Open Banking API (PSD2).

Покрывает ~2300 банков ЕС/Великобритании. Нужны ключи GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY
(https://bankaccountdata.gocardless.com). Документация: https://developer.gocardless.com/bank-account-data
"""
import hashlib
import os
import time
from typing import Optional

import httpx

from .base import BankAccount, BankError, BankTransaction, Connection, Institution

BASE_URL = os.environ.get("GOCARDLESS_BASE_URL", "https://bankaccountdata.gocardless.com/api/v2")


class GoCardlessProvider:
    name = "gocardless"

    def __init__(self, secret_id: Optional[str] = None, secret_key: Optional[str] = None,
                 client: Optional[httpx.Client] = None):
        self.secret_id = secret_id or os.environ.get("GOCARDLESS_SECRET_ID")
        self.secret_key = secret_key or os.environ.get("GOCARDLESS_SECRET_KEY")
        self.client = client or httpx.Client(base_url=BASE_URL, timeout=30)
        self._token: Optional[str] = None
        self._token_expires = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.secret_id and self.secret_key)

    # --- HTTP ---------------------------------------------------------------------------
    def _access_token(self) -> str:
        if not self.configured:
            raise BankError("GoCardless не настроен: задайте GOCARDLESS_SECRET_ID и GOCARDLESS_SECRET_KEY")
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        r = self.client.post("/token/new/", json={"secret_id": self.secret_id, "secret_key": self.secret_key})
        self._check(r)
        data = r.json()
        self._token = data["access"]
        self._token_expires = time.time() + int(data.get("access_expires", 3600))
        return self._token

    def _request(self, method: str, path: str, **kwargs) -> dict | list:
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        r = self.client.request(method, path, headers=headers, **kwargs)
        self._check(r)
        return r.json()

    @staticmethod
    def _check(r: httpx.Response) -> None:
        if r.status_code >= 400:
            try:
                detail = r.json()
            except ValueError:
                detail = r.text
            raise BankError(f"GoCardless {r.status_code}: {detail}")

    # --- API ----------------------------------------------------------------------------
    def list_institutions(self, country: str) -> list[Institution]:
        data = self._request("GET", "/institutions/", params={"country": country.lower()})
        return [Institution(id=i["id"], name=i["name"], logo=i.get("logo")) for i in data]

    def create_connection(self, institution_id: str, redirect_url: str, reference: str) -> Connection:
        data = self._request("POST", "/requisitions/", json={
            "redirect": redirect_url,
            "institution_id": institution_id,
            "reference": reference,
            "user_language": "RU",
        })
        return Connection(id=data["id"], link=data["link"])

    def list_accounts(self, connection_id: str) -> list[BankAccount]:
        req = self._request("GET", f"/requisitions/{connection_id}/")
        if req.get("status") not in ("LN", "linked", None) and not req.get("accounts"):
            raise BankError(f"Подключение ещё не подтверждено в банке (статус {req.get('status')})")
        accounts = []
        for acc_id in req.get("accounts", []):
            details = self._request("GET", f"/accounts/{acc_id}/details/").get("account", {})
            name = details.get("name") or details.get("product") or details.get("iban") or acc_id[:8]
            accounts.append(BankAccount(external_id=acc_id, name=name, currency=details.get("currency", "EUR")))
        return accounts

    def fetch_transactions(self, account_external_id: str, date_from: Optional[str]) -> list[BankTransaction]:
        params = {"date_from": date_from} if date_from else {}
        data = self._request("GET", f"/accounts/{account_external_id}/transactions/", params=params)
        booked = data.get("transactions", {}).get("booked", [])
        return [self._parse(t) for t in booked]

    @staticmethod
    def _parse(t: dict) -> BankTransaction:
        amount = float(t["transactionAmount"]["amount"])
        date = t.get("bookingDate") or t.get("valueDate") or ""
        description = (
            t.get("remittanceInformationUnstructured")
            or " ".join(t.get("remittanceInformationUnstructuredArray", []))
            or t.get("creditorName") or t.get("debtorName") or ""
        )
        if amount < 0 and t.get("creditorName") and t["creditorName"] not in description:
            description = f"{t['creditorName']} {description}".strip()
        ext = t.get("transactionId") or t.get("internalTransactionId")
        if not ext:  # некоторые банки не дают id — строим стабильный хэш
            ext = hashlib.sha1(f"{date}|{amount}|{description}".encode()).hexdigest()
        return BankTransaction(external_id=ext, date=date, amount=amount, description=description)
