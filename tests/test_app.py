import httpx
import pytest
from fastapi.testclient import TestClient

from app import db
from app.banks import set_provider
from app.banks.gocardless import GoCardlessProvider
from app.banks.importers import parse_amount, parse_csv, parse_ofx


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_parse_amount():
    assert parse_amount("-1 234,56") == -1234.56
    assert parse_amount("1,234.50") == 1234.5
    assert parse_amount("+500 ₽") == 500
    assert parse_amount("") is None


TBANK_CSV = (
    '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";'
    '"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание"\n'
    '"01.11.2026 12:30:00";"01.11.2026";"*1234";"OK";"-1250,50";"RUB";"-1250,50";"RUB";"";"Супермаркеты";"5411";"Пятёрочка"\n'
    '"02.11.2026 09:00:00";"02.11.2026";"";"OK";"80000,00";"RUB";"80000,00";"RUB";"";"Пополнения";"";"Зарплата"\n'
    '"03.11.2026 10:00:00";"03.11.2026";"*1234";"FAILED";"-500,00";"RUB";"-500,00";"RUB";"";"Такси";"4121";"Яндекс Go"\n'
).encode("cp1251")


def test_parse_tbank_csv():
    txs = parse_csv(TBANK_CSV)
    assert [(t.date, t.amount) for t in txs] == [("2026-11-01", -1250.5), ("2026-11-02", 80000.0)]
    assert "Пятёрочка" in txs[0].description


def test_parse_ofx():
    ofx = b"""OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000<TRNAMT>-42.10<FITID>abc1<NAME>LIDL<MEMO>Card
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>1000.00<FITID>abc2<NAME>Salary
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""
    txs = parse_ofx(ofx)
    assert [(t.external_id, t.date, t.amount) for t in txs] == [("abc1", "2026-11-05", -42.1), ("abc2", "2026-11-06", 1000.0)]


def test_import_is_idempotent_and_categorized(client):
    files = {"file": ("tbank.csv", TBANK_CSV, "text/csv")}
    r = client.post("/api/import", files=files).json()
    assert r["added"] == 2
    r2 = client.post("/api/import", files=files, data={"account_id": r["account_id"]}).json()
    assert r2["added"] == 0
    txs = client.get("/api/transactions").json()
    cats = {t["description"].split(" (")[0]: t["category"] for t in txs}
    assert cats["Пятёрочка"] == "Продукты"
    assert cats["Зарплата"] == "Зарплата"
    s = client.get("/api/summary").json()
    assert s["income"] == 80000 and s["expense"] == 1250.5


def test_demo_bank_flow(client):
    r = client.post("/api/banks/demo/connect", json={"institution_id": "DEMO_BANK"}).json()
    callback = r["link"].split("testserver", 1)[1]
    resp = client.get(callback, follow_redirects=False)
    assert resp.status_code == 307 and "bank_linked=2" in resp.headers["location"]
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 2 and all(a["tx_count"] > 0 for a in accounts)
    total = sum(a["tx_count"] for a in accounts)
    # повторная синхронизация не создаёт дублей
    client.post("/api/sync")
    assert sum(a["tx_count"] for a in client.get("/api/accounts").json()) == total


def test_manual_transaction_and_rule(client):
    acc = client.post("/api/accounts", json={"name": "Наличные"}).json()["id"]
    cats = {c["name"]: c["id"] for c in client.get("/api/categories").json()}
    t1 = client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-01", "amount": -300, "description": "Шаурма у дома"}).json()["id"]
    client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-02", "amount": -350, "description": "Шаурма у дома"})
    r = client.patch(f"/api/transactions/{t1}", json={"category_id": cats["Кафе и рестораны"], "remember": True}).json()
    assert r["updated"] == 2
    t3 = client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-03", "amount": -320, "description": "ШАУРМА У ДОМА"}).json()["id"]
    tx = next(t for t in client.get("/api/transactions").json() if t["id"] == t3)
    assert tx["category"] == "Кафе и рестораны"


def test_gocardless_provider_with_mock():
    def handler(req: httpx.Request):
        p = req.url.path
        if p.endswith("/token/new/"):
            return httpx.Response(200, json={"access": "tok", "access_expires": 86400})
        assert req.headers["authorization"] == "Bearer tok"
        if p.endswith("/requisitions/req1/"):
            return httpx.Response(200, json={"status": "LN", "accounts": ["acc1"]})
        if p.endswith("/accounts/acc1/details/"):
            return httpx.Response(200, json={"account": {"currency": "EUR", "name": "Girokonto"}})
        if p.endswith("/accounts/acc1/transactions/"):
            return httpx.Response(200, json={"transactions": {"booked": [
                {"transactionId": "t1", "bookingDate": "2026-11-01", "transactionAmount": {"amount": "-12.50", "currency": "EUR"},
                 "creditorName": "REWE", "remittanceInformationUnstructured": "Kartenzahlung"},
            ], "pending": []}})
        return httpx.Response(404, json={"detail": "not found"})

    client = httpx.Client(base_url="https://gc.test/api/v2", transport=httpx.MockTransport(handler))
    gc = GoCardlessProvider("id", "key", client=client)
    accs = gc.list_accounts("req1")
    assert accs[0].name == "Girokonto" and accs[0].currency == "EUR"
    txs = gc.fetch_transactions("acc1", "2026-10-01")
    assert txs[0].amount == -12.5 and txs[0].description == "REWE Kartenzahlung"
